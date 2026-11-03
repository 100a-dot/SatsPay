import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  getBlinkAccountStatus,
  getUsCheckoutConfig,
  getZeroFeePublicMode,
} from "@/lib/blink";
import {
  convertUsdToBtcAndFundBlinkStablesats,
  createStripeCheckoutSession,
  createWompiPaymentLink,
} from "@/lib/exchange";
import {
  createRemittance,
  listRemittances,
  updateRemittanceByClaimCode,
} from "@/lib/store";

export async function GET() {
  const isAdmin = await isAdminAuthenticated();
  const zeroFeePublicMode = getZeroFeePublicMode();
  const checkoutCfg = getUsCheckoutConfig();

  if (!isAdmin) {
    return NextResponse.json({
      zeroFeePublicMode,
      usCheckoutMode: checkoutCfg.usCheckoutMode,
    });
  }

  const remittances = await listRemittances();
  const stats = {
    totalCount: remittances.length,
    completedCount: remittances.filter((r) => r.status === "COMPLETED").length,
    readyToClaimCount: remittances.filter((r) => r.status === "READY_TO_CLAIM").length,
    lockedCount: remittances.filter((r) => r.isLocked).length,
    totalNetVolumeUsdCents: remittances
      .filter((r) => r.status === "COMPLETED")
      .reduce((acc, r) => acc + r.netPayoutUsdCents, 0),
  };

  return NextResponse.json({
    remittances,
    stats,
    zeroFeePublicMode,
    usCheckoutMode: checkoutCfg.usCheckoutMode,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { senderName, recipientName, securityPin, amountUsd } = body as {
      senderName?: string;
      recipientName?: string;
      securityPin?: string;
      amountUsd?: number;
    };

    if (!senderName?.trim() || !recipientName?.trim()) {
      return NextResponse.json(
        { error: "Por favor completa tu nombre y el nombre de quien recibe en El Salvador." },
        { status: 400 }
      );
    }

    const cleanedPin = (securityPin || "").trim();
    if (!/^\d{4}$/.test(cleanedPin)) {
      return NextResponse.json(
        { error: "El PIN de seguridad debe ser exactamente de 4 dígitos numéricos (ej. 4829)." },
        { status: 400 }
      );
    }

    const numericAmount = Number(amountUsd);
    if (!Number.isFinite(numericAmount) || numericAmount < 0.05 || numericAmount > 1000) {
      return NextResponse.json(
        { error: "El monto mínimo de envío es de $0.05 USD." },
        { status: 400 }
      );
    }

    const zeroFeePublicMode = getZeroFeePublicMode();
    const checkoutCfg = getUsCheckoutConfig();

    const netOrGrossCents = Math.round(numericAmount * 100);
    const feeUsdCents = zeroFeePublicMode
      ? 0
      : Math.max(10, Math.round(netOrGrossCents * 0.015) + 50);
    const amountSentUsdCents = netOrGrossCents + feeUsdCents;
    const netPayoutUsdCents = netOrGrossCents;

    const blinkStatus = await getBlinkAccountStatus();
    if (!blinkStatus.connected) {
      return NextResponse.json(
        {
          error:
            "El servicio de envíos se encuentra en mantenimiento temporal. Por favor intenta de nuevo en unos minutos.",
        },
        { status: 503 }
      );
    }

    if (
      checkoutCfg.fundingSourceMode === "prefunded_blink" &&
      true
    ) {
      const availableUsdCents = blinkStatus.usdWallet?.balance ?? 0;
      const btcSats = blinkStatus.btcWallet?.balance ?? 0;
      const btcPrice = blinkStatus.btcPriceUsd || 88500;
      const btcValueCents = Math.floor((btcSats / 100_000_000) * btcPrice * 100);

      if (availableUsdCents + btcValueCents < netPayoutUsdCents) {
        return NextResponse.json(
          {
            error:
              "En este momento el monto solicitado supera la liquidez inmediata disponible en tesorería. Por favor intenta con un monto menor.",
          },
          { status: 400 }
        );
      }
    }

    const originUrl =
      req.headers.get("origin") ||
      `${req.nextUrl.protocol}//${req.nextUrl.host}`;

    // CASO 1: Cobro con Tarjeta vía Wompi El Salvador (Banco Agrícola) - Opción Principal
    if (checkoutCfg.usCheckoutMode === "wompi") {
      const pendingRemittance = await createRemittance({
        senderName,
        recipientName,
        securityPin: cleanedPin,
        amountSentUsdCents,
        feeUsdCents,
        netPayoutUsdCents,
        paymentMode: blinkStatus.mode,
        usPaymentMethod: "WOMPI_CARD",
        initialStatus: "PENDING_PAYMENT",
        fundingSource: checkoutCfg.fundingSourceMode,
      });

      // Si el administrador ya configuró WOMPI_APP_ID y WOMPI_API_SECRET,
      // creamos el Enlace de Pago real en https://api.wompi.sv/EnlacePago
      if (checkoutCfg.wompiAppId && checkoutCfg.wompiApiSecret) {
        const wompiLink = await createWompiPaymentLink({
          wompiAppId: checkoutCfg.wompiAppId,
          wompiApiSecret: checkoutCfg.wompiApiSecret,
          claimCode: pendingRemittance.claimCode,
          senderName: pendingRemittance.senderName,
          recipientName: pendingRemittance.recipientName,
          totalAmountUsdCents: amountSentUsdCents,
          netPayoutUsdCents,
          originUrl,
        });

        await updateRemittanceByClaimCode(pendingRemittance.claimCode, {
          wompiEnlaceId: wompiLink.enlaceId,
        });

        return NextResponse.json({
          requiresStripeRedirect: true,
          checkoutUrl: wompiLink.checkoutUrl,
          sessionId: wompiLink.enlaceId,
          claimCode: pendingRemittance.claimCode,
        });
      }

      // Mientras la cuenta bancaria de Wompi está en verificación (sin llaves configuradas),
      // abrimos la pasarela Wompi integrada en /checkout/[code]
      const localWompiId = `wompi_local_${Date.now()}`;
      await updateRemittanceByClaimCode(pendingRemittance.claimCode, {
        wompiEnlaceId: localWompiId,
      });

      return NextResponse.json({
        requiresStripeRedirect: true,
        checkoutUrl: `/checkout/${encodeURIComponent(
          pendingRemittance.claimCode
        )}?provider=wompi&session_id=${localWompiId}`,
        sessionId: localWompiId,
        claimCode: pendingRemittance.claimCode,
      });
    }

    // CASO 2: Cobro con Tarjeta vía Stripe Checkout
    if (checkoutCfg.usCheckoutMode === "stripe") {
      if (checkoutCfg.stripeSecretKey && amountSentUsdCents < 50) {
        return NextResponse.json(
          {
            error:
              "La pasarela oficial de Stripe exige un cobro mínimo de $0.50 USD para pagos con tarjeta. Ingresa al menos $0.50 USD.",
          },
          { status: 400 }
        );
      }

      const pendingRemittance = await createRemittance({
        senderName,
        recipientName,
        securityPin: cleanedPin,
        amountSentUsdCents,
        feeUsdCents,
        netPayoutUsdCents,
        paymentMode: blinkStatus.mode,
        usPaymentMethod: "STRIPE_CARD",
        initialStatus: "PENDING_PAYMENT",
        fundingSource: checkoutCfg.fundingSourceMode,
      });

      if (checkoutCfg.stripeSecretKey) {
        const stripeSession = await createStripeCheckoutSession({
          stripeSecretKey: checkoutCfg.stripeSecretKey,
          claimCode: pendingRemittance.claimCode,
          senderName: pendingRemittance.senderName,
          recipientName: pendingRemittance.recipientName,
          totalAmountUsdCents: amountSentUsdCents,
          netPayoutUsdCents,
          originUrl,
        });

        await updateRemittanceByClaimCode(pendingRemittance.claimCode, {
          stripeSessionId: stripeSession.sessionId,
        });

        return NextResponse.json({
          requiresStripeRedirect: true,
          checkoutUrl: stripeSession.checkoutUrl,
          sessionId: stripeSession.sessionId,
          claimCode: pendingRemittance.claimCode,
        });
      }

      const localSessionId = `cs_local_${Date.now()}`;
      await updateRemittanceByClaimCode(pendingRemittance.claimCode, {
        stripeSessionId: localSessionId,
      });

      return NextResponse.json({
        requiresStripeRedirect: true,
        checkoutUrl: `/checkout/${encodeURIComponent(
          pendingRemittance.claimCode
        )}?provider=stripe&session_id=${localSessionId}`,
        sessionId: localSessionId,
        claimCode: pendingRemittance.claimCode,
      });
    }

    // CASO 3: Cobro Directo sin pasarela
    let blinkDepositInvoice: string | undefined;
    let strikeQuoteId: string | undefined;
    let strikePaymentId: string | undefined;

    const remittance = await createRemittance({
      senderName,
      recipientName,
      securityPin: cleanedPin,
      amountSentUsdCents,
      feeUsdCents,
      netPayoutUsdCents,
      paymentMode: blinkStatus.mode,
      usPaymentMethod: zeroFeePublicMode ? "TEST_ZERO_FEE" : "WOMPI_CARD",
      initialStatus: "PENDING_PAYMENT",
      fundingSource: checkoutCfg.fundingSourceMode,
    });

    if (
      checkoutCfg.fundingSourceMode === "strike_api" &&
      checkoutCfg.strikeApiKey
    ) {
      const bridgeResult = await convertUsdToBtcAndFundBlinkStablesats({
        amountUsdCents: netPayoutUsdCents,
        remittanceClaimCode: remittance.claimCode,
        strikeApiKey: checkoutCfg.strikeApiKey,
      });

      if (!bridgeResult.success) {
        await updateRemittanceByClaimCode(remittance.claimCode, {
          status: "FAILED",
          failureReason: bridgeResult.error,
        });
        return NextResponse.json(
          {
            error: `No se pudo completar la conversión automática USD -> BTC -> Stablesats: ${bridgeResult.error}`,
          },
          { status: 400 }
        );
      }

      blinkDepositInvoice = bridgeResult.blinkDepositInvoice;
      strikeQuoteId = bridgeResult.strikeQuoteId;
      strikePaymentId = bridgeResult.strikePaymentId;
    }

    const readyRemittance =
      (await updateRemittanceByClaimCode(remittance.claimCode, {
        status: "READY_TO_CLAIM",
        blinkDepositInvoice,
        strikeQuoteId,
        strikePaymentId,
      })) || remittance;

    return NextResponse.json({
      receipt: {
        claimCode: readyRemittance.claimCode,
        securityPin: readyRemittance.securityPin,
        senderName: readyRemittance.senderName,
        recipientName: readyRemittance.recipientName,
        amountSentUsdCents: readyRemittance.amountSentUsdCents,
        feeUsdCents: readyRemittance.feeUsdCents,
        netPayoutUsdCents: readyRemittance.netPayoutUsdCents,
        createdAt: readyRemittance.createdAt,
      },
      claimUrl: `/reclamar/${readyRemittance.claimCode}`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "No se pudo procesar tu envío en este momento. Intenta nuevamente.",
      },
      { status: 500 }
    );
  }
}

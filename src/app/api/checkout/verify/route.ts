import { NextRequest, NextResponse } from "next/server";
import {
  convertBlinkBtcWalletToStablesatsUsd,
  getBlinkAccountStatus,
  getUsCheckoutConfig,
} from "@/lib/blink";
import {
  convertUsdToBtcAndFundBlinkStablesats,
  verifyStripeCheckoutSessionPaid,
  verifyWompiPaymentPaid,
} from "@/lib/exchange";
import {
  getRemittanceByClaimCode,
  updateRemittanceByClaimCode,
} from "@/lib/store";

export async function GET(req: NextRequest) {
  const claimCode = req.nextUrl.searchParams.get("code") || "";
  const remittance = await getRemittanceByClaimCode(claimCode);

  if (!remittance) {
    return NextResponse.json(
      { error: "No se encontró la orden de pago." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    order: {
      claimCode: remittance.claimCode,
      senderName: remittance.senderName,
      recipientName: remittance.recipientName,
      amountSentUsdCents: remittance.amountSentUsdCents,
      feeUsdCents: remittance.feeUsdCents,
      netPayoutUsdCents: remittance.netPayoutUsdCents,
      status: remittance.status,
      usPaymentMethod: remittance.usPaymentMethod,
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, claimCode, wompiTransactionId } = body as {
      sessionId?: string;
      claimCode?: string;
      wompiTransactionId?: string;
    };

    if (!claimCode) {
      return NextResponse.json(
        { error: "Falta el código de la remesa para verificar el pago." },
        { status: 400 }
      );
    }

    const remittance = await getRemittanceByClaimCode(claimCode);
    if (!remittance) {
      return NextResponse.json(
        { error: "No se encontró la orden de remesa asociada al pago." },
        { status: 404 }
      );
    }

    const storedSessionId =
      remittance.wompiEnlaceId || remittance.stripeSessionId || "";

    if (remittance.status !== "PENDING_PAYMENT") {
      // Proteger el securityPin: solo devolver el recibo si el cliente presenta el sessionId o idTransaccion legítimo de la sesión
      const isAuthorizedSessionCaller =
        (sessionId && storedSessionId && String(sessionId) === String(storedSessionId)) ||
        (wompiTransactionId &&
          remittance.wompiTransactionId &&
          String(wompiTransactionId) === String(remittance.wompiTransactionId));

      if (!isAuthorizedSessionCaller) {
        return NextResponse.json(
          { error: "Esta orden ya fue procesada anteriormente." },
          { status: 403 }
        );
      }

      return NextResponse.json({
        receipt: {
          claimCode: remittance.claimCode,
          securityPin: remittance.securityPin,
          senderName: remittance.senderName,
          recipientName: remittance.recipientName,
          amountSentUsdCents: remittance.amountSentUsdCents,
          feeUsdCents: remittance.feeUsdCents,
          netPayoutUsdCents: remittance.netPayoutUsdCents,
          createdAt: remittance.createdAt,
        },
      });
    }

    const checkoutCfg = getUsCheckoutConfig();
    const hasProductionWompiKeys = Boolean(
      checkoutCfg.wompiAppId && checkoutCfg.wompiApiSecret
    );
    const hasProductionStripeKey = Boolean(checkoutCfg.stripeSecretKey);

    // SEGURIDAD: Solo permitir sesión interactiva local si el ID guardado por el servidor (NUNCA el del cliente)
    // es local Y las llaves de producción del proveedor no están activas.
    const isServerCreatedLocalSession =
      (storedSessionId.startsWith("wompi_local_") && !hasProductionWompiKeys) ||
      (storedSessionId.startsWith("cs_local_") && !hasProductionStripeKey);

    let resolvedWompiTxId = wompiTransactionId;

    if (!isServerCreatedLocalSession) {
      if (remittance.usPaymentMethod === "WOMPI_CARD") {
        if (!hasProductionWompiKeys || !remittance.wompiEnlaceId) {
          return NextResponse.json(
            { error: "Configuración de verificación Wompi incompleta en el servidor." },
            { status: 500 }
          );
        }

        const wompiVerification = await verifyWompiPaymentPaid({
          wompiAppId: checkoutCfg.wompiAppId,
          wompiApiSecret: checkoutCfg.wompiApiSecret,
          enlaceId: remittance.wompiEnlaceId,
          idTransaccion: wompiTransactionId,
        });

        if (!wompiVerification.paid) {
          return NextResponse.json(
            { error: "El pago en Wompi El Salvador aún no figura como aprobado." },
            { status: 400 }
          );
        }
        resolvedWompiTxId = wompiVerification.transactionId;
      } else if (remittance.usPaymentMethod === "STRIPE_CARD") {
        if (!hasProductionStripeKey || !remittance.stripeSessionId) {
          return NextResponse.json(
            { error: "Falta configuración de Stripe en el servidor." },
            { status: 500 }
          );
        }

        const verification = await verifyStripeCheckoutSessionPaid({
          stripeSecretKey: checkoutCfg.stripeSecretKey,
          sessionId: remittance.stripeSessionId,
        });

        if (!verification.paid) {
          return NextResponse.json(
            { error: "El pago en Stripe aún no figura como completado." },
            { status: 400 }
          );
        }
      }
    }

    let blinkDepositInvoice: string | undefined;
    let strikeQuoteId: string | undefined;
    let strikePaymentId: string | undefined;

    if (checkoutCfg.fundingSourceMode === "prefunded_blink") {
      const blinkStatus = await getBlinkAccountStatus();
      if (
        blinkStatus.connected &&
        blinkStatus.mode === "production" &&
        blinkStatus.usdWallet &&
        blinkStatus.btcWallet &&
        blinkStatus.usdWallet.balance < remittance.netPayoutUsdCents
      ) {
        const deficitCents = remittance.netPayoutUsdCents - blinkStatus.usdWallet.balance;
        await convertBlinkBtcWalletToStablesatsUsd({
          btcWalletId: blinkStatus.btcWallet.id,
          usdWalletId: blinkStatus.usdWallet.id,
          amountUsdCents: deficitCents,
          memo: `Respaldo Stablesats USD para remesa ${remittance.claimCode}`,
        });
      }
    } else if (
      checkoutCfg.fundingSourceMode === "strike_api" &&
      checkoutCfg.strikeApiKey
    ) {
      const bridgeResult = await convertUsdToBtcAndFundBlinkStablesats({
        amountUsdCents: remittance.netPayoutUsdCents,
        remittanceClaimCode: remittance.claimCode,
        strikeApiKey: checkoutCfg.strikeApiKey,
      });

      if (!bridgeResult.success) {
        await updateRemittanceByClaimCode(remittance.claimCode, {
          failureReason: `Pago con tarjeta recibido, pero falló fondeo automático desde Strike: ${bridgeResult.error}`,
        });
        return NextResponse.json(
          {
            error: `El cobro en USD se aprobó, pero falló la conversión automática en Strike API: ${bridgeResult.error}`,
          },
          { status: 500 }
        );
      }

      blinkDepositInvoice = bridgeResult.blinkDepositInvoice;
      strikeQuoteId = bridgeResult.strikeQuoteId;
      strikePaymentId = bridgeResult.strikePaymentId;
    }

    const updated = await updateRemittanceByClaimCode(remittance.claimCode, {
      status: "READY_TO_CLAIM",
      wompiTransactionId: resolvedWompiTxId || storedSessionId,
      stripeSessionId:
        remittance.usPaymentMethod === "STRIPE_CARD"
          ? remittance.stripeSessionId
          : undefined,
      fundingSource: checkoutCfg.fundingSourceMode,
      blinkDepositInvoice,
      strikeQuoteId,
      strikePaymentId,
      failureReason: undefined,
    });

    const finalRecord = updated || remittance;

    return NextResponse.json({
      receipt: {
        claimCode: finalRecord.claimCode,
        securityPin: finalRecord.securityPin,
        senderName: finalRecord.senderName,
        recipientName: finalRecord.recipientName,
        amountSentUsdCents: finalRecord.amountSentUsdCents,
        feeUsdCents: finalRecord.feeUsdCents,
        netPayoutUsdCents: finalRecord.netPayoutUsdCents,
        createdAt: finalRecord.createdAt,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Error verificando el pago de la remesa.",
      },
      { status: 500 }
    );
  }
}

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
  const remittance = getRemittanceByClaimCode(claimCode);

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

    const remittance = getRemittanceByClaimCode(claimCode);
    if (!remittance) {
      return NextResponse.json(
        { error: "No se encontró la orden de remesa asociada al pago." },
        { status: 404 }
      );
    }

    if (remittance.status !== "PENDING_PAYMENT") {
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
    const effectiveSessionId = sessionId || remittance.wompiEnlaceId || remittance.stripeSessionId || "";
    const isLocalInteractiveSession =
      effectiveSessionId.startsWith("cs_local_") ||
      effectiveSessionId.startsWith("wompi_local_");

    let resolvedWompiTxId = wompiTransactionId;

    if (!isLocalInteractiveSession) {
      if (remittance.usPaymentMethod === "WOMPI_CARD") {
        if (checkoutCfg.wompiAppId && checkoutCfg.wompiApiSecret) {
          const wompiVerification = await verifyWompiPaymentPaid({
            wompiAppId: checkoutCfg.wompiAppId,
            wompiApiSecret: checkoutCfg.wompiApiSecret,
            enlaceId: remittance.wompiEnlaceId || effectiveSessionId,
            idTransaccion: wompiTransactionId,
          });

          if (!wompiVerification.paid) {
            return NextResponse.json(
              { error: "El pago en Wompi El Salvador aún no figura como aprobado." },
              { status: 400 }
            );
          }
          resolvedWompiTxId = wompiVerification.transactionId;
        }
      } else if (remittance.usPaymentMethod === "STRIPE_CARD") {
        if (!checkoutCfg.stripeSecretKey) {
          return NextResponse.json(
            { error: "Falta configuración de Stripe en el servidor." },
            { status: 500 }
          );
        }

        const verification = await verifyStripeCheckoutSessionPaid({
          stripeSecretKey: checkoutCfg.stripeSecretKey,
          sessionId: effectiveSessionId,
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

    // Si el modo es prefunded_blink y el usuario tiene el saldo en Stablesats USD (recargado desde Chivo),
    // ya está listo en Stablesats USD. Si por alguna razón recargó en la billetera BTC de Blink y falta en USD,
    // convertimos automáticamente la diferencia de BTC -> Stablesats USD dentro de Blink ($0 comisión).
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
        updateRemittanceByClaimCode(remittance.claimCode, {
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

    const updated = updateRemittanceByClaimCode(remittance.claimCode, {
      status: "READY_TO_CLAIM",
      wompiTransactionId: resolvedWompiTxId || effectiveSessionId,
      stripeSessionId:
        remittance.usPaymentMethod === "STRIPE_CARD" ? effectiveSessionId : remittance.stripeSessionId,
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

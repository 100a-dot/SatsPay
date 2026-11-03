import { NextRequest, NextResponse } from "next/server";
import {
  convertBlinkBtcWalletToStablesatsUsd,
  getBlinkAccountStatus,
  payLightningInvoiceFromStablesats,
  probeLightningFeeFromUsd,
} from "@/lib/blink";
import { inspectChivoInvoice } from "@/lib/bolt11";
import {
  getRemittanceByClaimCode,
  toVerifiedRecipientView,
  updateRemittanceByClaimCode,
  verifyAndRecordPinAttempt,
} from "@/lib/store";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;
  const existing = await getRemittanceByClaimCode(code);

  if (!existing) {
    return NextResponse.json(
      { error: "No encontramos ninguna remesa con ese código." },
      { status: 404 }
    );
  }

  try {
    const body = await req.json();
    const { bolt11Invoice, securityPin } = body as {
      bolt11Invoice?: string;
      securityPin?: string;
    };

    if (!securityPin || !/^\d{4}$/.test(securityPin.trim())) {
      return NextResponse.json(
        { error: "Se requiere el PIN de seguridad de 4 dígitos para autorizar el retiro." },
        { status: 401 }
      );
    }

    const pinCheck = await verifyAndRecordPinAttempt(code, securityPin);
    if (pinCheck.locked) {
      return NextResponse.json(
        {
          error:
            "Esta remesa fue bloqueada por exceder el número máximo de intentos de PIN.",
        },
        { status: 423 }
      );
    }

    if (!pinCheck.valid || !pinCheck.record) {
      return NextResponse.json(
        {
          error: `PIN de seguridad inválido. Intentos restantes: ${pinCheck.remainingAttempts}.`,
        },
        { status: 401 }
      );
    }

    const remittance = pinCheck.record;

    if (remittance.status === "COMPLETED") {
      return NextResponse.json(
        {
          error: "Esta remesa ya fue depositada anteriormente.",
          remittance: toVerifiedRecipientView(remittance),
        },
        { status: 400 }
      );
    }

    if (remittance.status === "PROCESSING_PAYOUT") {
      return NextResponse.json(
        {
          error: "Tu pago ya se está procesando en este momento. Espera unos segundos.",
        },
        { status: 409 }
      );
    }

    if (!bolt11Invoice?.trim()) {
      return NextResponse.json(
        { error: "Por favor pega la factura generada en tu Chivo Wallet." },
        { status: 400 }
      );
    }

    const blinkStatus = await getBlinkAccountStatus();
    if (!blinkStatus.connected || !blinkStatus.usdWallet?.id) {
      return NextResponse.json(
        {
          error:
            "El servicio de desembolso instantáneo está en mantenimiento temporal. Intenta de nuevo en unos minutos.",
        },
        { status: 503 }
      );
    }

    const btcPriceUsd = blinkStatus.btcPriceUsd || 88500;
    const decoded = inspectChivoInvoice(bolt11Invoice, btcPriceUsd);

    if (!decoded.valid) {
      return NextResponse.json(
        {
          error: decoded.error || "La factura ingresada no es válida.",
          decoded,
        },
        { status: 400 }
      );
    }

    // Validar que el monto de la factura coincida con el monto a entregar de la remesa
    const expectedUsd = remittance.netPayoutUsdCents / 100;
    const invoiceUsd = decoded.estimatedUsd ?? expectedUsd;
    const allowedDiffUsd = Math.max(0.06, expectedUsd * 0.08);

    if (Math.abs(invoiceUsd - expectedUsd) > allowedDiffUsd) {
      return NextResponse.json(
        {
          error: `El monto de la factura que generaste en Chivo Wallet (~$${invoiceUsd.toFixed(
            2
          )} USD) no coincide con el monto de tu remesa ($${expectedUsd.toFixed(
            2
          )} USD). Por favor genera una nueva factura en Chivo Wallet poniendo exactamente $${expectedUsd.toFixed(
            2
          )} USD.`,
          decoded,
        },
        { status: 400 }
      );
    }

    if (blinkStatus.usdWallet.balance < remittance.netPayoutUsdCents) {
      return NextResponse.json(
        {
          error:
            "No fue posible completar el desembolso inmediato en este momento. Por favor intenta en unos minutos.",
        },
        { status: 503 }
      );
    }

    // Marcar como PROCESSING_PAYOUT
    await updateRemittanceByClaimCode(remittance.claimCode, {
      status: "PROCESSING_PAYOUT",
      chivoBolt11Invoice: bolt11Invoice.trim(),
      decodedInvoiceSats: decoded.satoshis,
      decodedInvoiceUsd: decoded.estimatedUsd,
      blinkWalletIdUsed: blinkStatus.usdWallet.id,
      failureReason: undefined,
    });

    let routingFeeUsdCents = 0;
    try {
      const feeProbe = await probeLightningFeeFromUsd({
        usdWalletId: blinkStatus.usdWallet.id,
        paymentRequest: bolt11Invoice.trim(),
      });
      routingFeeUsdCents = feeProbe.feeUsdCents;
    } catch {
      routingFeeUsdCents = 0;
    }

    let paymentResult = await payLightningInvoiceFromStablesats({
      usdWalletId: blinkStatus.usdWallet.id,
      paymentRequest: bolt11Invoice.trim(),
      memo: `Remesa ${remittance.claimCode} - $${expectedUsd.toFixed(2)} USD`,
    });

    // Si la billetera Stablesats USD tiene exactamente $0.50 (50 cents) y Blink pide 52-53 cents
    // por el diferencial de tipo de cambio/fee de ruta, intentamos cubrir esos centavos con la billetera BTC
    const firstErr = paymentResult.errors.map((e) => e.message).join("; ");
    if (
      paymentResult.status === "FAILURE" &&
      firstErr.toLowerCase().includes("exceeds balance") &&
      blinkStatus.btcWallet?.id &&
      (blinkStatus.btcWallet.balance ?? 0) > 50
    ) {
      try {
        await convertBlinkBtcWalletToStablesatsUsd({
          btcWalletId: blinkStatus.btcWallet.id,
          usdWalletId: blinkStatus.usdWallet.id,
          amountUsdCents: 10,
          memo: `Margen de tipo de cambio remesa ${remittance.claimCode}`,
        });
        paymentResult = await payLightningInvoiceFromStablesats({
          usdWalletId: blinkStatus.usdWallet.id,
          paymentRequest: bolt11Invoice.trim(),
          memo: `Remesa ${remittance.claimCode} - $${expectedUsd.toFixed(2)} USD`,
        });
      } catch {
        // Si no alcanzó para convertir a USD, intentar pagar directo desde la billetera BTC
      }

      if (
        paymentResult.status === "FAILURE" &&
        (blinkStatus.btcWallet.balance ?? 0) >= (decoded.satoshis ?? 0)
      ) {
        paymentResult = await payLightningInvoiceFromStablesats({
          usdWalletId: blinkStatus.btcWallet.id,
          paymentRequest: bolt11Invoice.trim(),
          memo: `Remesa ${remittance.claimCode} - $${expectedUsd.toFixed(2)} USD`,
        });
      }
    }

    if (
      paymentResult.status === "SUCCESS" ||
      paymentResult.status === "ALREADY_PAID" ||
      paymentResult.status === "PENDING"
    ) {
      const completed = await updateRemittanceByClaimCode(remittance.claimCode, {
        status: "COMPLETED",
        paymentMode: paymentResult.mode,
        blinkTransactionRef: `${paymentResult.status}_${Date.now()}`,
        routingFeeUsdCents,
        claimedAt: new Date().toISOString(),
        failureReason: undefined,
      });

      return NextResponse.json({
        success: true,
        remittance: completed ? toVerifiedRecipientView(completed) : null,
      });
    } else {
      const internalErrMsg =
        paymentResult.errors.map((e) => e.message).join("; ") ||
        "La red rechazó el pago de la factura.";

      await updateRemittanceByClaimCode(remittance.claimCode, {
        status: "READY_TO_CLAIM",
        failureReason: internalErrMsg,
      });

      return NextResponse.json(
        {
          error:
            "Ha ocurrido un error inesperado al procesar tu retiro. Por favor intenta nuevamente en unos momentos.",
        },
        { status: 400 }
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error inesperado";
    await updateRemittanceByClaimCode(existing.claimCode, {
      status: "READY_TO_CLAIM",
      failureReason: msg,
    });
    return NextResponse.json(
      { error: "Ocurrió un error al procesar tu retiro. Intenta nuevamente." },
      { status: 500 }
    );
  }
}

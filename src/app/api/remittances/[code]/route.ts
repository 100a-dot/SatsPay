import { NextRequest, NextResponse } from "next/server";
import { getBlinkAccountStatus } from "@/lib/blink";
import {
  getRemittanceByClaimCode,
  toPublicSummary,
  toVerifiedRecipientView,
  verifyAndRecordPinAttempt,
} from "@/lib/store";

/**
 * GET público: Solo devuelve el resumen enmascarado (estado y si requiere PIN),
 * sin revelar quién envía, quién recibe ni el monto hasta que se valide el PIN.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;
  const remittance = await getRemittanceByClaimCode(code);

  if (!remittance) {
    return NextResponse.json(
      { error: "No encontramos ninguna remesa con ese código. Verifica que esté bien escrito." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    summary: toPublicSummary(remittance),
  });
}

/**
 * POST público: Verifica el PIN secreto de 4 dígitos.
 * Si falla 5 veces, bloquea automáticamente la remesa contra ataques de fuerza bruta.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;
  const remittance = await getRemittanceByClaimCode(code);

  if (!remittance) {
    return NextResponse.json(
      { error: "No encontramos ninguna remesa con ese código." },
      { status: 404 }
    );
  }

  try {
    const body = await req.json();
    const { securityPin } = body as { securityPin?: string };

    if (!securityPin || !/^\d{4}$/.test(securityPin.trim())) {
      return NextResponse.json(
        { error: "Ingresa el PIN de seguridad de 4 dígitos." },
        { status: 400 }
      );
    }

    const verification = await verifyAndRecordPinAttempt(code, securityPin);

    if (verification.locked) {
      return NextResponse.json(
        {
          error:
            "Esta remesa ha sido bloqueada por seguridad tras 5 intentos fallidos de PIN. Contacta a soporte o al remitente para desbloquearla.",
          locked: true,
          remainingAttempts: 0,
        },
        { status: 423 }
      );
    }

    if (!verification.valid || !verification.record) {
      return NextResponse.json(
        {
          error: `PIN incorrecto. Te quedan ${verification.remainingAttempts} ${
            verification.remainingAttempts === 1 ? "intento" : "intentos"
          } antes de que se bloquee la remesa.`,
          locked: false,
          remainingAttempts: verification.remainingAttempts,
        },
        { status: 401 }
      );
    }

    const blinkStatus = await getBlinkAccountStatus();

    return NextResponse.json({
      verified: true,
      remittance: toVerifiedRecipientView(verification.record),
      btcPriceUsd: blinkStatus.btcPriceUsd || 88500,
    });
  } catch {
    return NextResponse.json(
      { error: "Error al verificar el PIN de seguridad." },
      { status: 500 }
    );
  }
}

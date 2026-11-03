import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  type CheckoutProviderMode,
  convertBlinkBtcWalletToStablesatsUsd,
  createStablesatsUsdInvoice,
  type FundingSourceMode,
  getBlinkAccountStatus,
  getUsCheckoutConfig,
  type PaymentMode,
  probeLightningFeeFromUsd,
  saveRuntimeBlinkConfig,
} from "@/lib/blink";
import { inspectChivoInvoice } from "@/lib/bolt11";
import {
  checkStrikeAccountStatus,
  checkWompiAccountStatus,
  convertUsdToBtcAndFundBlinkStablesats,
} from "@/lib/exchange";
import { unlockRemittanceByClaimCode } from "@/lib/store";

export async function GET() {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const status = await getBlinkAccountStatus();
  const checkoutCfg = getUsCheckoutConfig();
  const [wompiStatus, strikeStatus] = await Promise.all([
    checkoutCfg.wompiAppId && checkoutCfg.wompiApiSecret
      ? checkWompiAccountStatus({
          wompiAppId: checkoutCfg.wompiAppId,
          wompiApiSecret: checkoutCfg.wompiApiSecret,
        })
      : Promise.resolve({ connected: false }),
    checkoutCfg.strikeApiKey
      ? checkStrikeAccountStatus(checkoutCfg.strikeApiKey)
      : Promise.resolve({ connected: false }),
  ]);

  return NextResponse.json({
    ...status,
    wompiStatus,
    strikeStatus,
  });
}

export async function POST(req: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      action,
      apiKey,
      mode,
      usdWalletId,
      amountCents,
      memo,
      bolt11Invoice,
      btcPriceUsd,
      claimCode,
      zeroFeePublicMode,
      newAdminPassword,
      usCheckoutMode,
      wompiAppId,
      wompiApiSecret,
      stripeSecretKey,
      fundingSourceMode,
      strikeApiKey,
    } = body as {
      action:
        | "check_status"
        | "create_usd_invoice"
        | "inspect_invoice"
        | "unlock_remittance"
        | "set_fee_mode"
        | "change_admin_password"
        | "save_exchange_config"
        | "test_strike_to_blink_bridge"
        | "convert_blink_btc_to_usd";
      apiKey?: string;
      mode?: PaymentMode;
      usdWalletId?: string;
      amountCents?: number;
      memo?: string;
      bolt11Invoice?: string;
      btcPriceUsd?: number;
      claimCode?: string;
      zeroFeePublicMode?: boolean;
      newAdminPassword?: string;
      usCheckoutMode?: CheckoutProviderMode;
      wompiAppId?: string;
      wompiApiSecret?: string;
      stripeSecretKey?: string;
      fundingSourceMode?: FundingSourceMode;
      strikeApiKey?: string;
    };

    if (action === "check_status") {
      const status = await getBlinkAccountStatus({
        overrideMode: mode,
        overrideApiKey: apiKey?.trim() || undefined,
        persistIfValid: true,
      });
      const checkoutCfg = getUsCheckoutConfig();
      const [wompiStatus, strikeStatus] = await Promise.all([
        checkoutCfg.wompiAppId && checkoutCfg.wompiApiSecret
          ? checkWompiAccountStatus({
              wompiAppId: checkoutCfg.wompiAppId,
              wompiApiSecret: checkoutCfg.wompiApiSecret,
            })
          : Promise.resolve({ connected: false }),
        checkoutCfg.strikeApiKey
          ? checkStrikeAccountStatus(checkoutCfg.strikeApiKey)
          : Promise.resolve({ connected: false }),
      ]);
      return NextResponse.json({ ...status, wompiStatus, strikeStatus });
    }

    if (action === "save_exchange_config") {
      const configPatch: Parameters<typeof saveRuntimeBlinkConfig>[0] = {};
      if (usCheckoutMode) configPatch.usCheckoutMode = usCheckoutMode;
      if (wompiAppId !== undefined && wompiAppId.trim() !== "") {
        configPatch.wompiAppId = wompiAppId.trim();
      }
      if (wompiApiSecret !== undefined && wompiApiSecret.trim() !== "") {
        configPatch.wompiApiSecret = wompiApiSecret.trim();
      }
      if (stripeSecretKey !== undefined && stripeSecretKey.trim() !== "") {
        configPatch.stripeSecretKey = stripeSecretKey.trim();
      }
      if (fundingSourceMode) configPatch.fundingSourceMode = fundingSourceMode;
      if (strikeApiKey !== undefined && strikeApiKey.trim() !== "") {
        configPatch.strikeApiKey = strikeApiKey.trim();
      }
      saveRuntimeBlinkConfig(configPatch);

      const status = await getBlinkAccountStatus();
      const checkoutCfg = getUsCheckoutConfig();
      const [wompiStatus, strikeStatus] = await Promise.all([
        checkoutCfg.wompiAppId && checkoutCfg.wompiApiSecret
          ? checkWompiAccountStatus({
              wompiAppId: checkoutCfg.wompiAppId,
              wompiApiSecret: checkoutCfg.wompiApiSecret,
            })
          : Promise.resolve({ connected: false }),
        checkoutCfg.strikeApiKey
          ? checkStrikeAccountStatus(checkoutCfg.strikeApiKey)
          : Promise.resolve({ connected: false }),
      ]);

      return NextResponse.json({ ...status, wompiStatus, strikeStatus });
    }

    if (action === "convert_blink_btc_to_usd") {
      const status = await getBlinkAccountStatus();
      if (!status.connected || !status.btcWallet?.id || !status.usdWallet?.id) {
        return NextResponse.json(
          { error: "Blink API no conectada o billeteras no encontradas." },
          { status: 400 }
        );
      }
      const targetCents = Math.max(1, Number(amountCents || 50));
      const result = await convertBlinkBtcWalletToStablesatsUsd({
        btcWalletId: status.btcWallet.id,
        usdWalletId: status.usdWallet.id,
        amountUsdCents: targetCents,
      });
      const updatedStatus = await getBlinkAccountStatus();
      return NextResponse.json({
        conversionResult: result,
        status: updatedStatus,
      });
    }

    if (action === "test_strike_to_blink_bridge") {
      const checkoutCfg = getUsCheckoutConfig();
      const bridgeResult = await convertUsdToBtcAndFundBlinkStablesats({
        amountUsdCents: Number(amountCents || 10),
        remittanceClaimCode: `TEST-${Date.now().toString().slice(-4)}`,
        strikeApiKey: strikeApiKey?.trim() || checkoutCfg.strikeApiKey,
      });
      const status = await getBlinkAccountStatus();
      const strikeStatus = checkoutCfg.strikeApiKey
        ? await checkStrikeAccountStatus(checkoutCfg.strikeApiKey)
        : { connected: false };

      return NextResponse.json({
        bridgeResult,
        status: { ...status, strikeStatus },
      });
    }

    if (action === "set_fee_mode") {
      saveRuntimeBlinkConfig({ zeroFeePublicMode: Boolean(zeroFeePublicMode) });
      const status = await getBlinkAccountStatus();
      return NextResponse.json(status);
    }

    if (action === "change_admin_password") {
      if (!newAdminPassword || newAdminPassword.trim().length < 4) {
        return NextResponse.json(
          { error: "La nueva contraseña debe tener al menos 4 caracteres." },
          { status: 400 }
        );
      }
      saveRuntimeBlinkConfig({ adminPassword: newAdminPassword.trim() });
      return NextResponse.json({ success: true });
    }

    if (action === "unlock_remittance") {
      if (!claimCode) {
        return NextResponse.json({ error: "Falta claimCode" }, { status: 400 });
      }
      const unlocked = await unlockRemittanceByClaimCode(claimCode);
      return NextResponse.json({ remittance: unlocked });
    }

    if (action === "create_usd_invoice") {
      if (!usdWalletId) {
        return NextResponse.json(
          { error: "Se requiere el ID de la billetera USD (Stablesats)." },
          { status: 400 }
        );
      }
      const invoice = await createStablesatsUsdInvoice({
        usdWalletId,
        amountCents: Number(amountCents || 100),
        memo,
        overrideMode: mode,
        overrideApiKey: apiKey?.trim() || undefined,
      });
      return NextResponse.json({ invoice });
    }

    if (action === "inspect_invoice") {
      const decoded = inspectChivoInvoice(bolt11Invoice || "", btcPriceUsd || 88500);
      let feeProbeCents: number | undefined;
      let feeProbeError: string | undefined;

      if (decoded.valid && usdWalletId) {
        try {
          const probe = await probeLightningFeeFromUsd({
            usdWalletId,
            paymentRequest: bolt11Invoice || "",
            overrideMode: mode,
            overrideApiKey: apiKey?.trim() || undefined,
          });
          feeProbeCents = probe.feeUsdCents;
        } catch (err) {
          feeProbeError = err instanceof Error ? err.message : "No se pudo estimar fee";
        }
      }

      return NextResponse.json({
        decoded,
        feeProbeCents,
        feeProbeError,
      });
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Error interno en el endpoint de administración",
      },
      { status: 500 }
    );
  }
}

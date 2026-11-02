import { createStablesatsUsdInvoice, getBlinkAccountStatus, type CheckoutProviderMode, type FundingSourceMode } from "./blink";

/**
 * Motor Real de Cobro en USD:
 * 1. Wompi El Salvador (Banco Agrícola - https://api.wompi.sv) — No requiere cuenta en EE.UU.
 * 2. Stripe Checkout (https://api.stripe.com/v1) — Opcional.
 * 3. Resguardo en Blink Stablesats (USD) + Strike API opcional.
 */

export type UsCheckoutMode = CheckoutProviderMode;
export type { FundingSourceMode };

export interface WompiStatusResult {
  connected: boolean;
  appId?: string;
  error?: string;
}

export interface StrikeBalance {
  currency: string;
  available: string;
  total: string;
}

export interface StrikeStatusResult {
  connected: boolean;
  balances?: StrikeBalance[];
  usdAvailable?: string;
  btcAvailable?: string;
  error?: string;
}

export interface StablesatsBridgeResult {
  success: boolean;
  fundingSource: FundingSourceMode;
  blinkDepositInvoice?: string;
  blinkDepositPaymentHash?: string;
  strikeQuoteId?: string;
  strikePaymentId?: string;
  strikeConversionRate?: string;
  error?: string;
}

const WOMPI_AUTH_URL = "https://id.wompi.sv/connect/token";
const WOMPI_API_BASE = "https://api.wompi.sv";
const STRIKE_API_BASE = "https://api.strike.me/v1";
const STRIPE_API_BASE = "https://api.stripe.com/v1";

/**
 * Obtiene un token OAuth2 real desde Wompi El Salvador (Banco Agrícola)
 * POST https://id.wompi.sv/connect/token
 */
export async function getWompiAccessToken(params: {
  wompiAppId: string;
  wompiApiSecret: string;
}): Promise<string> {
  const clientId = params.wompiAppId.trim();
  const clientSecret = params.wompiApiSecret.trim();

  if (!clientId || !clientSecret) {
    throw new Error("Faltan WOMPI_APP_ID o WOMPI_API_SECRET.");
  }

  const form = new URLSearchParams();
  form.append("grant_type", "client_credentials");
  form.append("audience", "wompi_api");
  form.append("client_id", clientId);
  form.append("client_secret", clientSecret);

  const res = await fetch(WOMPI_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(
      data?.error_description ||
        data?.error ||
        `Wompi rechazó la autenticación OAuth2 (HTTP ${res.status}). Verifica tu App ID y API Secret.`
    );
  }

  return data.access_token as string;
}

/**
 * Verifica si las credenciales de Wompi El Salvador (App ID + API Secret) son válidas.
 */
export async function checkWompiAccountStatus(params: {
  wompiAppId?: string;
  wompiApiSecret?: string;
}): Promise<WompiStatusResult> {
  const appId = (params.wompiAppId ?? process.env.WOMPI_APP_ID ?? "").trim();
  const apiSecret = (params.wompiApiSecret ?? process.env.WOMPI_API_SECRET ?? "").trim();

  if (!appId || !apiSecret) {
    return {
      connected: false,
      error: "Falta configurar WOMPI_APP_ID y WOMPI_API_SECRET en /admin o .env.",
    };
  }

  try {
    await getWompiAccessToken({ wompiAppId: appId, wompiApiSecret: apiSecret });
    return {
      connected: true,
      appId,
    };
  } catch (err) {
    return {
      connected: false,
      appId,
      error: err instanceof Error ? err.message : "Error al autenticar con Wompi El Salvador",
    };
  }
}

/**
 * Crea un Enlace de Pago real en Wompi El Salvador (POST https://api.wompi.sv/EnlacePago)
 * que acepta tarjetas Visa y Mastercard (de EE.UU., El Salvador o internacionales) en USD.
 */
export async function createWompiPaymentLink(params: {
  wompiAppId: string;
  wompiApiSecret: string;
  claimCode: string;
  senderName: string;
  recipientName: string;
  totalAmountUsdCents: number;
  netPayoutUsdCents: number;
  originUrl: string;
}): Promise<{ enlaceId: string; checkoutUrl: string; qrUrl?: string }> {
  const token = await getWompiAccessToken({
    wompiAppId: params.wompiAppId,
    wompiApiSecret: params.wompiApiSecret,
  });

  const montoUsd = Number((params.totalAmountUsdCents / 100).toFixed(2));
  const netUsd = (params.netPayoutUsdCents / 100).toFixed(2);
  const isLocalhost =
    params.originUrl.includes("localhost") || params.originUrl.includes("127.0.0.1");
  const redirectUrl = isLocalhost
    ? `https://remesassv.vercel.app/?wompi_return=1&code=${encodeURIComponent(
        params.claimCode
      )}`
    : `${params.originUrl}/?wompi_return=1&code=${encodeURIComponent(
        params.claimCode
      )}`;

  const payload = {
    identificadorEnlaceComercio: params.claimCode,
    monto: montoUsd,
    nombreProducto: `Remesa para ${params.recipientName} ($${netUsd} USD a recibir en Chivo Wallet)`,
    formaPago: {
      permitirTarjetaCreditoDebido: true,
      permitirPagoConPuntoAgricola: false,
      permitirPagoEnCuotasAgricola: false,
    },
    infoProducto: {
      descripcionProducto: `Código de remesa: ${params.claimCode} • Enviado por ${params.senderName}`,
    },
    configuracion: {
      urlRedirect: redirectUrl,
      esMontoEditable: false,
      esCantidadEditable: false,
      cantidadPorDefecto: 1,
      emailsNotificacion: "adiel.aureli.dev@gmail.com",
      notificarTransaccionCliente: true,
    },
  };

  const res = await fetch(`${WOMPI_API_BASE}/EnlacePago`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.urlEnlace) {
    const detail =
      data?.mensajes?.[0] ||
      data?.mensaje ||
      data?.title ||
      `Error HTTP ${res.status} al crear EnlacePago en Wompi`;
    throw new Error(
      `${detail}. (Asegúrate de que tu cuenta bancaria en Wompi ya esté en estado 'Verificada' y asociada a tu Aplicación).`
    );
  }

  return {
    enlaceId: String(data.idEnlace),
    checkoutUrl: data.urlEnlace as string,
    qrUrl: data.urlQrCodeEnlace as string | undefined,
  };
}

/**
 * Verifica el pago de una transacción o enlace en Wompi El Salvador.
 */
export async function verifyWompiPaymentPaid(params: {
  wompiAppId: string;
  wompiApiSecret: string;
  enlaceId?: string;
  idTransaccion?: string;
}): Promise<{
  paid: boolean;
  transactionId?: string;
}> {
  const token = await getWompiAccessToken({
    wompiAppId: params.wompiAppId,
    wompiApiSecret: params.wompiApiSecret,
  });

  // 1. Si Wompi devolvió idTransaccion en la URL de retorno, consultamos GET /TransaccionCompra/{id}
  if (params.idTransaccion && !params.idTransaccion.startsWith("wompi_local_")) {
    const txRes = await fetch(
      `${WOMPI_API_BASE}/TransaccionCompra/${encodeURIComponent(params.idTransaccion)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      }
    );

    if (txRes.ok) {
      const txData = await txRes.json();
      if (txData.esAprobada) {
        return {
          paid: true,
          transactionId: String(txData.idTransaccion || params.idTransaccion),
        };
      }
      return { paid: false };
    }
  }

  // 2. Si tenemos el idEnlace, consultamos GET /EnlacePago/{idEnlace}
  if (params.enlaceId && !params.enlaceId.startsWith("wompi_local_")) {
    const linkRes = await fetch(
      `${WOMPI_API_BASE}/EnlacePago/${encodeURIComponent(params.enlaceId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      }
    );

    if (linkRes.ok) {
      const linkData = await linkRes.json();
      const txs = Array.isArray(linkData.transaccionCompra)
        ? linkData.transaccionCompra
        : linkData.transaccionCompra
        ? [linkData.transaccionCompra]
        : [];
      const approvedTx = txs.find(
        (t: { esAprobada?: boolean; idTransaccion?: string }) => t.esAprobada === true
      );
      if (approvedTx) {
        return {
          paid: true,
          transactionId: String(approvedTx.idTransaccion || params.enlaceId),
        };
      }
      return { paid: false };
    }
  }

  return {
    paid: false,
  };
}

/**
 * Consulta los saldos reales (USD y BTC) en la cuenta de Strike del negocio
 * usando GET https://api.strike.me/v1/balances
 */
export async function checkStrikeAccountStatus(
  strikeApiKey?: string
): Promise<StrikeStatusResult> {
  const apiKey = (strikeApiKey ?? process.env.STRIKE_API_KEY ?? "").trim();

  if (!apiKey) {
    return {
      connected: false,
      error: "Falta configurar STRIKE_API_KEY en /admin o en .env.",
    };
  }

  try {
    const res = await fetch(`${STRIKE_API_BASE}/balances`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        connected: false,
        error: `Strike API respondió HTTP ${res.status}: ${text}`,
      };
    }

    const balances = (await res.json()) as StrikeBalance[];
    const usd = balances.find((b) => b.currency === "USD");
    const btc = balances.find((b) => b.currency === "BTC");

    return {
      connected: true,
      balances,
      usdAvailable: usd?.available ?? "0.00",
      btcAvailable: btc?.available ?? "0.00000000",
    };
  } catch (err) {
    return {
      connected: false,
      error:
        err instanceof Error
          ? err.message
          : "Error de red al conectar con Strike API",
    };
  }
}

/**
 * PUENTE OPCIONAL CON STRIKE API:
 * 1. Genera una factura Lightning en USD (Stablesats) en tu billetera Blink (lnUsdInvoiceCreate).
 * 2. Usa tu saldo en USD en Strike API para comprar Bitcoin y pagar esa factura Lightning de Blink.
 */
export async function convertUsdToBtcAndFundBlinkStablesats(params: {
  amountUsdCents: number;
  remittanceClaimCode: string;
  strikeApiKey?: string;
}): Promise<StablesatsBridgeResult> {
  const apiKey = (params.strikeApiKey ?? process.env.STRIKE_API_KEY ?? "").trim();

  if (!apiKey) {
    return {
      success: false,
      fundingSource: "strike_api",
      error:
        "STRIKE_API_KEY no está configurada. Configúrala en /admin para comprar BTC automáticamente con USD.",
    };
  }

  const blinkStatus = await getBlinkAccountStatus();
  if (!blinkStatus.connected || !blinkStatus.usdWallet?.id) {
    return {
      success: false,
      fundingSource: "strike_api",
      error:
        blinkStatus.error ||
        "Blink API no está conectada o no se encontró la billetera Stablesats USD.",
    };
  }

  const usdFormatted = (params.amountUsdCents / 100).toFixed(2);
  let blinkInvoice;
  try {
    blinkInvoice = await createStablesatsUsdInvoice({
      usdWalletId: blinkStatus.usdWallet.id,
      amountCents: params.amountUsdCents,
      memo: `Fondeo Remesa ${params.remittanceClaimCode} ($${usdFormatted} USD a Stablesats)`,
    });
  } catch (err) {
    return {
      success: false,
      fundingSource: "strike_api",
      error: `Error al generar factura Stablesats en Blink: ${
        err instanceof Error ? err.message : "Error desconocido"
      }`,
    };
  }

  try {
    const quoteRes = await fetch(`${STRIKE_API_BASE}/payment-quotes/lightning`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        lnInvoice: blinkInvoice.paymentRequest,
        sourceCurrency: "USD",
      }),
      cache: "no-store",
    });

    if (!quoteRes.ok) {
      const errText = await quoteRes.text();
      return {
        success: false,
        fundingSource: "strike_api",
        blinkDepositInvoice: blinkInvoice.paymentRequest,
        error: `Strike rechazó la cotización USD -> BTC (HTTP ${quoteRes.status}): ${errText}`,
      };
    }

    const quoteData = (await quoteRes.json()) as {
      paymentQuoteId: string;
      conversionRate?: { amount?: string };
    };

    const quoteId = quoteData.paymentQuoteId;
    if (!quoteId) {
      return {
        success: false,
        fundingSource: "strike_api",
        blinkDepositInvoice: blinkInvoice.paymentRequest,
        error: "Strike API no devolvió un paymentQuoteId válido.",
      };
    }

    const executeRes = await fetch(
      `${STRIKE_API_BASE}/payment-quotes/${encodeURIComponent(quoteId)}/execute`,
      {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        cache: "no-store",
      }
    );

    if (!executeRes.ok) {
      const execErrText = await executeRes.text();
      return {
        success: false,
        fundingSource: "strike_api",
        blinkDepositInvoice: blinkInvoice.paymentRequest,
        strikeQuoteId: quoteId,
        error: `Error al ejecutar pago en Strike API (HTTP ${executeRes.status}): ${execErrText}`,
      };
    }

    const executeData = (await executeRes.json()) as {
      paymentId?: string;
      state?: "COMPLETED" | "PENDING" | "FAILED";
    };

    if (executeData.state === "FAILED") {
      return {
        success: false,
        fundingSource: "strike_api",
        blinkDepositInvoice: blinkInvoice.paymentRequest,
        strikeQuoteId: quoteId,
        error: "El envío Lightning desde Strike hacia Blink falló.",
      };
    }

    return {
      success: true,
      fundingSource: "strike_api",
      blinkDepositInvoice: blinkInvoice.paymentRequest,
      blinkDepositPaymentHash: blinkInvoice.paymentHash,
      strikeQuoteId: quoteId,
      strikePaymentId: executeData.paymentId,
      strikeConversionRate: quoteData.conversionRate?.amount,
    };
  } catch (err) {
    return {
      success: false,
      fundingSource: "strike_api",
      blinkDepositInvoice: blinkInvoice.paymentRequest,
      error:
        err instanceof Error
          ? err.message
          : "Error de conexión ejecutando conversión en Strike API",
    };
  }
}

/**
 * Crea una sesión real de Stripe Checkout (Opcional)
 */
export async function createStripeCheckoutSession(params: {
  stripeSecretKey: string;
  claimCode: string;
  senderName: string;
  recipientName: string;
  totalAmountUsdCents: number;
  netPayoutUsdCents: number;
  originUrl: string;
}): Promise<{ sessionId: string; checkoutUrl: string }> {
  const secretKey = params.stripeSecretKey.trim();
  if (!secretKey) {
    throw new Error("Falta STRIPE_SECRET_KEY.");
  }

  if (params.totalAmountUsdCents < 50) {
    throw new Error(
      "Stripe exige un cobro mínimo de $0.50 USD para pagos con tarjeta. Ingresa al menos $0.50 USD."
    );
  }

  const netUsd = (params.netPayoutUsdCents / 100).toFixed(2);
  const bodyParams = new URLSearchParams();
  bodyParams.append("mode", "payment");
  bodyParams.append("payment_method_types[0]", "card");
  bodyParams.append(
    "success_url",
    `${params.originUrl}/?stripe_session_id={CHECKOUT_SESSION_ID}&code=${encodeURIComponent(
      params.claimCode
    )}`
  );
  bodyParams.append(
    "cancel_url",
    `${params.originUrl}/?canceled=1&code=${encodeURIComponent(params.claimCode)}`
  );
  bodyParams.append("line_items[0][price_data][currency]", "usd");
  bodyParams.append(
    "line_items[0][price_data][unit_amount]",
    String(params.totalAmountUsdCents)
  );
  bodyParams.append(
    "line_items[0][price_data][product_data][name]",
    `Remesa a El Salvador para ${params.recipientName} ($${netUsd} USD netos)`
  );
  bodyParams.append(
    "line_items[0][price_data][product_data][description]",
    `Código de remesa: ${params.claimCode} • Enviado por ${params.senderName}`
  );
  bodyParams.append("line_items[0][quantity]", "1");
  bodyParams.append("metadata[claimCode]", params.claimCode);

  const res = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: bodyParams.toString(),
    cache: "no-store",
  });

  const data = await res.json();
  if (!res.ok || !data.url || !data.id) {
    throw new Error(
      data?.error?.message || `Error al crear sesión en Stripe (HTTP ${res.status})`
    );
  }

  return {
    sessionId: data.id as string,
    checkoutUrl: data.url as string,
  };
}

/**
 * Verifica directamente contra la API de Stripe si una sesión de Checkout ya fue pagada.
 */
export async function verifyStripeCheckoutSessionPaid(params: {
  stripeSecretKey: string;
  sessionId: string;
}): Promise<{
  paid: boolean;
  claimCode?: string;
  amountTotalCents?: number;
  paymentIntentId?: string;
}> {
  const res = await fetch(
    `${STRIPE_API_BASE}/checkout/sessions/${encodeURIComponent(params.sessionId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${params.stripeSecretKey.trim()}`,
      },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    throw new Error("No se pudo verificar la sesión de pago con Stripe.");
  }

  const session = await res.json();
  return {
    paid: session.payment_status === "paid",
    claimCode: session.metadata?.claimCode,
    amountTotalCents: session.amount_total,
    paymentIntentId:
      typeof session.payment_intent === "string" ? session.payment_intent : undefined,
  };
}

"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Send,
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Check,
  ArrowRight,
  User,
  DollarSign,
  AlertTriangle,
  KeyRound,
  RefreshCw,
  Printer,
  Share2,
} from "lucide-react";

const QUICK_AMOUNTS = ["1.00", "10.00", "25.00", "50.00"];

interface CustomerReceipt {
  claimCode: string;
  securityPin: string;
  senderName: string;
  recipientName: string;
  amountSentUsdCents: number;
  feeUsdCents: number;
  netPayoutUsdCents: number;
  createdAt: string;
}

function generateRandom4DigitPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export default function SendRemittanceSection() {
  const [amountUsd, setAmountUsd] = useState<string>("25.00");
  const [zeroFeePublicMode, setZeroFeePublicMode] = useState<boolean>(true);
  const [senderName, setSenderName] = useState<string>("");
  const [recipientName, setRecipientName] = useState<string>("");
  const [securityPin, setSecurityPin] = useState<string>("4829");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [verifyingStripeReturn, setVerifyingStripeReturn] = useState<boolean>(false);
  const [activeWompiCheckout, setActiveWompiCheckout] = useState<{
    checkoutUrl: string;
    sessionId: string;
    claimCode: string;
  } | null>(null);
  const [checkingWompiStatus, setCheckingWompiStatus] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<CustomerReceipt | null>(null);
  const [copiedDetails, setCopiedDetails] = useState<boolean>(false);

  useEffect(() => {
    setSecurityPin(generateRandom4DigitPin());

    // Verificar si el usuario viene regresando de pagar con tarjeta en Wompi El Salvador o Stripe
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const stripeSessionId = params.get("stripe_session_id");
      const wompiReturn = params.get("wompi_return");
      const wompiTxId = params.get("idTransaccion") || undefined;
      const localSessionId = params.get("session_id") || undefined;
      const code =
        params.get("code") ||
        params.get("identificadorEnlaceComercio") ||
        "";
      const canceled = params.get("canceled");

      if (canceled) {
        setError("El pago con tarjeta fue cancelado. No se realizó ningún cargo.");
      } else if ((wompiReturn || stripeSessionId || wompiTxId) && code) {
        setVerifyingStripeReturn(true);
        fetch("/api/checkout/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: stripeSessionId || localSessionId || wompiTxId || "wompi_redirect",
            wompiTransactionId: wompiTxId,
            claimCode: code,
          }),
        })
          .then(async (res) => {
            const data = await res.json();
            if (!res.ok || data.error) {
              setError(data.error || "No se pudo verificar el pago con tarjeta.");
            } else if (data.receipt) {
              setReceipt(data.receipt);
              window.history.replaceState({}, "", window.location.pathname);
            }
          })
          .catch(() =>
            setError("Error de red al confirmar tu pago con tarjeta.")
          )
          .finally(() => setVerifyingStripeReturn(false));
      }
    }

    fetch("/api/remittances")
      .then((r) => r.json())
      .then((data) => {
        if (typeof data.zeroFeePublicMode === "boolean") {
          setZeroFeePublicMode(data.zeroFeePublicMode);
        }
      })
      .catch(() => null);
  }, []);

  const numericAmount = Math.max(0, parseFloat(amountUsd || "0") || 0);
  const netCents = Math.round(numericAmount * 100);
  const feeCents = zeroFeePublicMode
    ? 0
    : numericAmount > 0
    ? Math.max(10, Math.round(netCents * 0.015) + 50)
    : 0;
  const totalChargedCents = netCents + feeCents;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/remittances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderName,
          recipientName,
          securityPin,
          amountUsd: numericAmount,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "No se pudo procesar el envío.");
        setSubmitting(false);
      } else if (data.requiresStripeRedirect && data.checkoutUrl) {
        if (String(data.checkoutUrl).includes("wompi.sv")) {
          // Abrir el enlace oficial de Wompi en pestaña nueva y monitorear su aprobación en vivo desde localhost
          setActiveWompiCheckout({
            checkoutUrl: data.checkoutUrl,
            sessionId: data.sessionId,
            claimCode: data.claimCode,
          });
          setSubmitting(false);
          window.open(data.checkoutUrl, "_blank", "noopener,noreferrer");
        } else {
          window.location.href = data.checkoutUrl;
        }
      } else {
        setReceipt(data.receipt);
        setSubmitting(false);
      }
    } catch {
      setError("Error de conexión al procesar tu envío. Intenta nuevamente.");
      setSubmitting(false);
    }
  }

  function getShareMessage(r: CustomerReceipt) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const claimLink = `${origin}/reclamar/${r.claimCode}`;
    const usd = (r.netPayoutUsdCents / 100).toFixed(2);
    return (
      `Hola ${r.recipientName}, te envié una remesa de $${usd} USD para recibir en tu Chivo Wallet.\n\n` +
      `🔗 Enlace para cobrar: ${claimLink}\n` +
      `📋 Código de Remesa: ${r.claimCode}\n` +
      `🔐 PIN de Seguridad: ${r.securityPin}`
    );
  }

  function handleCopyAll(r: CustomerReceipt) {
    navigator.clipboard.writeText(getShareMessage(r));
    setCopiedDetails(true);
    setTimeout(() => setCopiedDetails(false), 2500);
  }

  function handleWhatsAppShare(r: CustomerReceipt) {
    const text = encodeURIComponent(getShareMessage(r));
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  }

  useEffect(() => {
    if (!activeWompiCheckout || receipt) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/checkout/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: activeWompiCheckout.sessionId,
            claimCode: activeWompiCheckout.claimCode,
          }),
        });
        const data = await res.json();
        if (res.ok && data.receipt) {
          setReceipt(data.receipt);
          setActiveWompiCheckout(null);
          setError(null);
        }
      } catch {
        // Seguir esperando mientras el cliente completa el pago en Wompi
      }
    }, 3500);

    return () => clearInterval(interval);
  }, [activeWompiCheckout, receipt]);

  async function handleManualWompiCheck() {
    if (!activeWompiCheckout) return;
    setCheckingWompiStatus(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: activeWompiCheckout.sessionId,
          claimCode: activeWompiCheckout.claimCode,
        }),
      });
      const data = await res.json();
      if (res.ok && data.receipt) {
        setReceipt(data.receipt);
        setActiveWompiCheckout(null);
      } else {
        setError(
          data.error ||
            "Aún no aparece completado el pago en Wompi. Completa el pago en la ventana de Wompi e intenta de nuevo."
        );
      }
    } finally {
      setCheckingWompiStatus(false);
    }
  }

  if (activeWompiCheckout && !receipt) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-slate-900/90 p-8 text-center space-y-5 shadow-2xl">
        <RefreshCw className="h-10 w-10 text-amber-400 animate-spin mx-auto" />
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
            Pasarela Oficial Wompi El Salvador • Orden {activeWompiCheckout.claimCode}
          </span>
          <h2 className="text-2xl font-bold text-white">
            Completa tu pago con tarjeta en la ventana de Wompi
          </h2>
          <p className="text-sm text-slate-300 max-w-xl mx-auto">
            Se abrió tu enlace seguro de pago en <strong>Wompi (Banco Agrícola)</strong>. En cuanto apruebes tu tarjeta, esta pantalla detectará tu pago automáticamente y te mostrará tu recibo y PIN.
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-200 max-w-lg mx-auto">
            {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <a
            href={activeWompiCheckout.checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-6 py-3.5 text-sm transition"
          >
            <CreditCard className="h-4 w-4" />
            Abrir Enlace de Pago en Wompi
          </a>

          <button
            type="button"
            onClick={handleManualWompiCheck}
            disabled={checkingWompiStatus}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold px-5 py-3.5 text-sm transition"
          >
            <CheckCircle2 className="h-4 w-4" />
            {checkingWompiStatus
              ? "Verificando con Wompi API..."
              : "Ya pagué en Wompi • Verificar ahora"}
          </button>
        </div>

        <div>
          <button
            type="button"
            onClick={() => {
              setActiveWompiCheckout(null);
              setError(null);
            }}
            className="text-xs text-slate-400 hover:text-white underline"
          >
            Cancelar y volver al formulario
          </button>
        </div>
      </div>
    );
  }

  if (verifyingStripeReturn) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-10 text-center space-y-4 shadow-2xl">
        <RefreshCw className="h-10 w-10 text-amber-400 animate-spin mx-auto" />
        <h2 className="text-xl font-bold text-white">
          Confirmando tu pago con tarjeta y preparando tu remesa...
        </h2>
        <p className="text-sm text-slate-400">
          Estamos verificando la transacción y habilitando el cobro inmediato en El Salvador.
        </p>
      </div>
    );
  }

  if (receipt) {
    return (
      <div className="rounded-2xl border border-emerald-500/40 bg-slate-900/90 p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex items-start gap-4 pb-6 border-b border-slate-800">
          <div className="h-12 w-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Comprobante Oficial de Envío • Pago Confirmado
            </span>
            <h2 className="text-2xl font-bold text-white mt-0.5">
              ¡Tu remesa de ${(receipt.netPayoutUsdCents / 100).toFixed(2)} USD está lista!
            </h2>
            <p className="text-sm text-slate-300 mt-1">
              Comparte el <strong>Código de Remesa</strong> y el <strong>PIN de 4 dígitos</strong> con{" "}
              <strong className="text-white">{receipt.recipientName}</strong> para que reciba los dólares en su Chivo Wallet.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-950 p-5 rounded-xl border border-slate-800">
          <div>
            <span className="text-xs text-slate-400 block">1. Código de Remesa:</span>
            <code className="text-2xl font-bold tracking-wider text-amber-400 block mt-1">
              {receipt.claimCode}
            </code>
          </div>

          <div>
            <span className="text-xs text-slate-400 block">2. PIN de Seguridad (4 dígitos):</span>
            <code className="text-2xl font-bold tracking-widest text-sky-400 block mt-1">
              {receipt.securityPin}
            </code>
          </div>

          <div>
            <span className="text-xs text-slate-400 block">Monto a recibir en El Salvador:</span>
            <p className="text-2xl font-bold text-emerald-400 mt-1">
              ${(receipt.netPayoutUsdCents / 100).toFixed(2)} USD
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-950/50 p-4 rounded-xl border border-slate-800/80">
          <div>
            <span className="text-slate-400 block">Enviado por:</span>
            <strong className="text-white">{receipt.senderName}</strong>
          </div>
          <div>
            <span className="text-slate-400 block">Recibe en El Salvador:</span>
            <strong className="text-white">{receipt.recipientName}</strong>
          </div>
          <div>
            <span className="text-slate-400 block">Total pagado:</span>
            <strong className="text-white">
              ${(receipt.amountSentUsdCents / 100).toFixed(2)} USD
            </strong>
          </div>
          <div>
            <span className="text-slate-400 block">Fecha:</span>
            <strong className="text-white">
              {new Date(receipt.createdAt).toLocaleString("es-SV")}
            </strong>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 pt-2 print:hidden">
          <button
            type="button"
            onClick={() => handleWhatsAppShare(receipt)}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-5 py-3.5 text-sm transition shadow-lg shadow-emerald-500/10"
          >
            <Share2 className="h-4 w-4" />
            Compartir por WhatsApp al Destinatario
          </button>

          <button
            type="button"
            onClick={() => handleCopyAll(receipt)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold px-4 py-3.5 text-sm transition"
          >
            {copiedDetails ? (
              <Check className="h-4 w-4 text-emerald-400" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copiedDetails ? "¡Datos Copiados!" : "Copiar Enlace + PIN"}
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium px-4 py-3.5 text-sm transition"
          >
            <Printer className="h-4 w-4" />
            Imprimir Recibo
          </button>
        </div>

        <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs print:hidden">
          <Link
            href={`/reclamar/${receipt.claimCode}`}
            className="text-amber-400 hover:text-amber-300 font-semibold inline-flex items-center gap-1"
          >
            Ir a la página de cobro de esta remesa ({receipt.claimCode})
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>

          <button
            type="button"
            onClick={() => {
              setReceipt(null);
              setSecurityPin(generateRandom4DigitPin());
            }}
            className="text-slate-400 hover:text-white transition"
          >
            Realizar otro envío
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-6 sm:p-8 shadow-2xl">
      <div className="pb-6 border-b border-slate-800">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-full">
          <Send className="h-3.5 w-3.5" />
          Envío Instantáneo a El Salvador
        </span>
        <h2 className="text-2xl font-bold text-white mt-2">
          ¿Cuánto dinero quieres enviar hoy?
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Tu familiar recibe el monto exacto en dólares directamente en su cuenta de{" "}
          <strong className="text-white">Chivo Wallet</strong> en segundos.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-5 space-y-4">
          <label className="text-sm font-semibold text-white flex items-center gap-1.5">
            <DollarSign className="h-4 w-4 text-emerald-400" />
            Monto que recibirá tu familiar en El Salvador (USD)
          </label>

          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-emerald-400">
              $
            </span>
            <input
              type="number"
              step="0.01"
              min="0.05"
              required
              value={amountUsd}
              onChange={(e) => setAmountUsd(e.target.value)}
              className="w-full rounded-xl bg-slate-900 border border-slate-700 pl-10 pr-20 py-3.5 text-2xl font-bold text-white focus:outline-none focus:border-amber-500"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
              USD
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">Montos rápidos:</span>
            {QUICK_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setAmountUsd(amt)}
                className={`px-3 py-1 rounded-lg text-xs font-medium border transition ${
                  amountUsd === amt
                    ? "bg-amber-500 text-slate-950 border-amber-400 font-semibold"
                    : "bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700"
                }`}
              >
                ${amt}
              </button>
            ))}
          </div>

          <div className="pt-4 border-t border-slate-800/90 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="bg-slate-900/70 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 block">Comisión de envío:</span>
              <span className="text-base font-bold text-amber-300">
                ${(feeCents / 100).toFixed(2)} USD
              </span>
            </div>
            <div className="bg-slate-900/70 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 block">Total a pagar hoy:</span>
              <span className="text-base font-bold text-white">
                ${(totalChargedCents / 100).toFixed(2)} USD
              </span>
            </div>
            <div className="bg-emerald-950/30 p-3 rounded-xl border border-emerald-500/30">
              <span className="text-emerald-300 block">Tu familiar recibe exacto:</span>
              <span className="text-lg font-bold text-emerald-400">
                ${(netCents / 100).toFixed(2)} USD
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-4 space-y-2">
            <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-sky-400" />
              Tu nombre completo
            </label>
            <input
              type="text"
              required
              placeholder="Ej. Carlos Martínez"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-4 space-y-2">
            <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-amber-400" />
              ¿Quién recibe en El Salvador?
            </label>
            <input
              type="text"
              required
              placeholder="Ej. María López"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-emerald-400" />
                PIN de Seguridad (4 dígitos)
              </label>
              <button
                type="button"
                onClick={() => setSecurityPin(generateRandom4DigitPin())}
                className="text-[11px] text-amber-400 hover:text-amber-300 inline-flex items-center gap-1"
                title="Generar otro PIN aleatorio"
              >
                <RefreshCw className="h-3 w-3" />
                Otro
              </button>
            </div>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              required
              value={securityPin}
              onChange={(e) => setSecurityPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="4829"
              className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 text-sm font-mono font-bold tracking-widest text-emerald-300 focus:outline-none focus:border-amber-500"
            />
            <p className="text-[11px] text-slate-400">
              Tu familiar necesitará este PIN para retirar el dinero.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-4 flex items-start gap-3 text-sm text-rose-200">
            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || netCents < 5}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold px-6 py-4 text-base shadow-lg shadow-amber-500/10 transition"
        >
          <CreditCard className="h-5 w-5" />
          {submitting
            ? "Abriendo pasarela segura de pago..."
            : `Continuar al Pago con Tarjeta ($${(totalChargedCents / 100).toFixed(2)} USD)`}
        </button>

        <p className="text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          Pago seguro con tarjeta Visa / Mastercard • Protegido con PIN de 4 dígitos.
        </p>
      </form>
    </div>
  );
}

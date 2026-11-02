"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import {
  Zap,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
  ShieldCheck,
  ArrowLeft,
  RefreshCw,
  Lock,
  KeyRound,
  Printer,
} from "lucide-react";
import type {
  PublicRemittanceSummary,
  VerifiedRecipientRemittanceView,
} from "@/lib/store";
import type { DecodedBolt11Invoice } from "@/lib/bolt11";

export default function ReclamarCodigoPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const [summary, setSummary] = useState<PublicRemittanceSummary | null>(null);
  const [remittance, setRemittance] = useState<VerifiedRecipientRemittanceView | null>(null);
  const [btcPriceUsd, setBtcPriceUsd] = useState<number>(88500);
  const [loading, setLoading] = useState<boolean>(true);
  const [notFoundError, setNotFoundError] = useState<string | null>(null);

  // Estado de verificación de PIN de 4 dígitos
  const [securityPin, setSecurityPin] = useState<string>("");
  const [pinVerified, setPinVerified] = useState<boolean>(false);
  const [verifyingPin, setVerifyingPin] = useState<boolean>(false);
  const [pinError, setPinError] = useState<string | null>(null);

  // Estado de factura de Chivo Wallet
  const [bolt11Input, setBolt11Input] = useState<string>("");
  const [decodedPreview, setDecodedPreview] = useState<DecodedBolt11Invoice | null>(null);
  const [validatingInvoice, setValidatingInvoice] = useState<boolean>(false);

  const [claiming, setClaiming] = useState<boolean>(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/remittances/${encodeURIComponent(code)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || data.error) {
          setNotFoundError(data.error || "Remesa no encontrada");
        } else {
          setSummary(data.summary);
        }
      })
      .catch(() => setNotFoundError("No fue posible consultar el código de remesa."))
      .finally(() => setLoading(false));
  }, [code]);

  async function handleVerifyPin(e: React.FormEvent) {
    e.preventDefault();
    if (securityPin.length !== 4) return;

    setVerifyingPin(true);
    setPinError(null);

    try {
      const res = await fetch(`/api/remittances/${encodeURIComponent(code)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ securityPin }),
      });
      const data = await res.json();

      if (!res.ok) {
        setPinError(data.error || "PIN incorrecto.");
        if (data.locked && summary) {
          setSummary({ ...summary, isLocked: true, remainingAttempts: 0 });
        } else if (typeof data.remainingAttempts === "number" && summary) {
          setSummary({ ...summary, remainingAttempts: data.remainingAttempts });
        }
      } else {
        setRemittance(data.remittance);
        setBtcPriceUsd(data.btcPriceUsd || 88500);
        setPinVerified(true);
      }
    } catch {
      setPinError("Error de conexión al verificar el PIN.");
    } finally {
      setVerifyingPin(false);
    }
  }

  async function validatePastedInvoice(rawInvoice: string) {
    setBolt11Input(rawInvoice);
    setClaimError(null);
    if (!rawInvoice.trim()) {
      setDecodedPreview(null);
      return;
    }

    setValidatingInvoice(true);
    try {
      const res = await fetch("/api/invoice/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bolt11Invoice: rawInvoice.trim(),
          btcPriceUsd,
        }),
      });
      const data = await res.json();
      setDecodedPreview(data.decoded);
    } catch {
      setDecodedPreview(null);
    } finally {
      setValidatingInvoice(false);
    }
  }

  async function handleClaimPayout(e: React.FormEvent) {
    e.preventDefault();
    if (!remittance || !bolt11Input.trim()) return;

    setClaiming(true);
    setClaimError(null);

    try {
      const res = await fetch(
        `/api/remittances/${encodeURIComponent(remittance.claimCode)}/claim`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            securityPin,
            bolt11Invoice: bolt11Input.trim(),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || data.error) {
        setClaimError(data.error || "No se pudo completar el depósito a tu Chivo Wallet.");
      } else if (data.remittance) {
        setRemittance(data.remittance);
      }
    } catch {
      setClaimError("Error de conexión al procesar tu retiro. Intenta nuevamente.");
    } finally {
      setClaiming(false);
    }
  }

  const exactUsdString = remittance
    ? (remittance.netPayoutUsdCents / 100).toFixed(2)
    : "0.00";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <Navbar />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-4 print:hidden">
          <Link
            href="/reclamar"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Ingresar otro código de remesa
          </Link>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center text-sm text-slate-400">
            Verificando código de remesa <code className="text-amber-300">{code}</code>...
          </div>
        ) : notFoundError || !summary ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-8 text-center space-y-4">
            <AlertTriangle className="h-10 w-10 text-rose-400 mx-auto" />
            <h1 className="text-xl font-bold text-white">Código de remesa no encontrado</h1>
            <p className="text-sm text-rose-200">{notFoundError}</p>
            <Link
              href="/reclamar"
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 text-slate-950 font-semibold px-5 py-2.5 text-xs"
            >
              Intentar con otro código
            </Link>
          </div>
        ) : summary.isLocked ? (
          /* Pantalla de Bloqueo por Seguridad tras 5 intentos fallidos de PIN */
          <div className="rounded-2xl border border-rose-500/40 bg-slate-900/90 p-8 text-center space-y-4 shadow-2xl">
            <div className="h-14 w-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
              <Lock className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-bold text-white">
              Remesa Bloqueada por Seguridad ({summary.claimCode})
            </h1>
            <p className="text-sm text-slate-300 max-w-md mx-auto">
              Se superó el límite de 5 intentos fallidos de PIN. Por protección de tus fondos, el retiro ha quedado bloqueado temporalmente. Pide al remitente o a soporte que desbloquee tu orden.
            </p>
          </div>
        ) : !pinVerified || !remittance ? (
          /* Paso 1: Candado de Verificación de PIN de 4 dígitos */
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <div className="h-12 w-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
                <KeyRound className="h-6 w-6" />
              </div>
              <span className="text-xs font-mono font-bold text-amber-400 block">
                Código: {summary.claimCode}
              </span>
              <h1 className="text-2xl font-bold text-white">
                Ingresa tu PIN de Seguridad
              </h1>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                Para proteger tu dinero, escribe el <strong>PIN de 4 dígitos</strong> que te compartió la persona que te envió la remesa.
              </p>
            </div>

            <form onSubmit={handleVerifyPin} className="max-w-xs mx-auto space-y-4">
              <input
                type="password"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                required
                autoFocus
                value={securityPin}
                onChange={(e) =>
                  setSecurityPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                placeholder="••••"
                className="w-full text-center rounded-xl bg-slate-950 border border-slate-700 py-4 text-3xl font-mono font-bold tracking-[0.6em] text-white placeholder-slate-700 focus:outline-none focus:border-amber-500"
              />

              {pinError && (
                <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-200 text-center">
                  {pinError}
                </div>
              )}

              <button
                type="submit"
                disabled={verifyingPin || securityPin.length !== 4}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold px-6 py-3.5 text-sm transition"
              >
                {verifyingPin ? "Verificando PIN..." : "Desbloquear mi Remesa"}
              </button>
            </form>

            <p className="text-center text-[11px] text-slate-500">
              Intentos disponibles: {summary.remainingAttempts} de 5
            </p>
          </div>
        ) : remittance.status === "COMPLETED" ? (
          /* Paso 3: Comprobante Limpio para el Cliente */
          <div className="rounded-2xl border border-emerald-500/40 bg-slate-900/85 p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="text-center space-y-2 pb-6 border-b border-slate-800">
              <div className="h-16 w-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto">
                <CheckCircle2 className="h-9 w-9" />
              </div>
              <span className="inline-block text-xs font-semibold uppercase tracking-wider text-emerald-400">
                ¡Depósito Completado al Instante!
              </span>
              <h1 className="text-3xl font-extrabold text-white">
                +${exactUsdString} USD Recibidos
              </h1>
              <p className="text-sm text-slate-300">
                Tus dólares ya fueron enviados a tu cuenta de <strong>Chivo Wallet</strong>.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-950/80 p-5 rounded-xl border border-slate-800">
              <div>
                <span className="text-slate-400 block">Código de Remesa:</span>
                <strong className="text-amber-400 font-mono text-sm">
                  {remittance.claimCode}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block">Estado:</span>
                <strong className="text-emerald-400">PAGADA EN USD</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Enviado por:</span>
                <strong className="text-white">{remittance.senderName}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Recibido por:</span>
                <strong className="text-white">{remittance.recipientName}</strong>
              </div>
              <div className="sm:col-span-2">
                <span className="text-slate-400 block">Fecha y Hora de Pago:</span>
                <strong className="text-white">
                  {remittance.claimedAt
                    ? new Date(remittance.claimedAt).toLocaleString("es-SV")
                    : "Ahora mismo"}
                </strong>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-5 py-3 text-xs transition"
              >
                <Printer className="h-4 w-4" />
                Imprimir / Guardar Comprobante
              </button>
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-3 text-xs transition"
              >
                Volver al Inicio
              </Link>
            </div>
          </div>
        ) : (
          /* Paso 2: Pantalla de Cobro Verificada donde el destinatario pega la factura de Chivo Wallet */
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    {remittance.claimCode}
                  </span>
                  <span className="text-xs text-emerald-300 font-medium">
                    • PIN Verificado
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-white mt-2">
                  Hola, {remittance.recipientName}
                </h1>
                <p className="text-xs sm:text-sm text-slate-400">
                  <strong className="text-slate-200">{remittance.senderName}</strong> te envió una remesa lista para depositar en tu <strong className="text-amber-300">Chivo Wallet</strong>.
                </p>
              </div>

              <div className="rounded-2xl bg-emerald-950/40 border border-emerald-500/40 px-5 py-4 text-center sm:text-right shrink-0">
                <span className="text-[11px] uppercase tracking-wider text-emerald-300 block font-semibold">
                  Monto a recibir
                </span>
                <span className="text-3xl font-extrabold text-emerald-400">
                  ${exactUsdString} <span className="text-sm font-semibold">USD</span>
                </span>
              </div>
            </div>

            {/* Guía visual paso a paso para Chivo Wallet */}
            <div className="rounded-xl bg-slate-950/90 border border-slate-800 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-amber-400" />
                Sigue estos 4 pasos en tu Chivo Wallet:
              </h2>
              <ol className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-300 leading-relaxed">
                <li className="bg-slate-900/90 p-3.5 rounded-lg border border-slate-800/80">
                  <strong className="text-amber-400 block mb-1">
                    1. Abre Chivo Wallet y toca &ldquo;Recibir&rdquo;
                  </strong>
                  Abre tu app <strong>Chivo Wallet</strong>, introduce el PIN de tu cuenta y una vez adentro haz clic en el botón que dice <strong>Recibir</strong>.
                </li>
                <li className="bg-slate-900/90 p-3.5 rounded-lg border border-amber-500/30">
                  <strong className="text-amber-400 block mb-1">
                    2. Elige &ldquo;BTC&rdquo; y &ldquo;Convertir a USD&rdquo;
                  </strong>
                  En esa ventana selecciona la opción <strong>BTC</strong>, luego selecciona <strong>Convertir a USD</strong> y haz clic donde dice <strong>Recibir Bitcoin vía Lightning</strong>.
                </li>
                <li className="bg-slate-900/90 p-3.5 rounded-lg border border-emerald-500/30">
                  <strong className="text-emerald-400 block mb-1">
                    3. Pon ${exactUsdString} y toca &ldquo;Solicitar&rdquo;
                  </strong>
                  En la nueva ventana introduce el monto igual a <strong>${exactUsdString}</strong> y una vez introducido haz clic en el botón que dice <strong>Solicitar</strong>.
                </li>
                <li className="bg-slate-900/90 p-3.5 rounded-lg border border-slate-800/80">
                  <strong className="text-amber-400 block mb-1">
                    4. Toca &ldquo;Copiar&rdquo; debajo del QR y pega aquí
                  </strong>
                  Se mostrará una ventana con un código QR y abajo un botón que dice <strong>Copiar</strong>. Haz clic en <strong>Copiar</strong> para copiar el texto de la factura y pégalo aquí abajo.
                </li>
              </ol>
            </div>

            <form onSubmit={handleClaimPayout} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  Pega aquí tu factura de Chivo Wallet por ${exactUsdString} USD:
                </label>
                <textarea
                  rows={3}
                  required
                  value={bolt11Input}
                  onChange={(e) => validatePastedInvoice(e.target.value)}
                  placeholder="Pega aquí el texto que copiaste de Chivo Wallet (lnbc...)"
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 p-3.5 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>

              {validatingInvoice && (
                <p className="text-xs text-slate-400">Verificando factura...</p>
              )}

              {decodedPreview && (
                <div
                  className={`rounded-xl p-4 border text-xs space-y-1 ${
                    decodedPreview.valid
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
                      : "bg-rose-500/10 border-rose-500/30 text-rose-200"
                  }`}
                >
                  <div className="font-semibold flex items-center gap-1.5 text-sm">
                    {decodedPreview.valid ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        Factura de Chivo Wallet Verificada (~$
                        {decodedPreview.estimatedUsd?.toFixed(2)} USD)
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-4 w-4 text-rose-400" />
                        Revisa tu factura
                      </>
                    )}
                  </div>
                  {decodedPreview.error && <p>{decodedPreview.error}</p>}
                </div>
              )}

              {claimError && (
                <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-4 flex items-start gap-2.5 text-xs text-rose-200">
                  <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>{claimError}</div>
                </div>
              )}

              <button
                type="submit"
                disabled={
                  claiming ||
                  !bolt11Input.trim() ||
                  (decodedPreview !== null && !decodedPreview.valid)
                }
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold px-6 py-4 text-base shadow-lg shadow-emerald-500/10 transition"
              >
                {claiming ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    Depositando ${exactUsdString} USD en tu Chivo Wallet...
                  </>
                ) : (
                  <>
                    <Zap className="h-5 w-5" />
                    Recibir ${exactUsdString} USD en mi Chivo Wallet Ahora
                  </>
                )}
              </button>

              <p className="text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                Depósito directo e instantáneo en dólares estadounidenses.
              </p>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}

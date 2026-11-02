"use client";

import React, { useEffect, useState, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CreditCard,
  Lock,
  ArrowLeft,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  Building2,
} from "lucide-react";

interface OrderInfo {
  claimCode: string;
  senderName: string;
  recipientName: string;
  amountSentUsdCents: number;
  feeUsdCents: number;
  netPayoutUsdCents: number;
  status: string;
  usPaymentMethod?: string;
}

export default function CardCheckoutPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const provider = searchParams.get("provider") || "wompi";
  const isWompi = provider !== "stripe";
  const sessionId =
    searchParams.get("session_id") ||
    (isWompi ? `wompi_local_${Date.now()}` : `cs_local_${Date.now()}`);

  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [cardHolder, setCardHolder] = useState<string>("");
  const [cardNumber, setCardNumber] = useState<string>("4532 •••• •••• 8821");
  const [cardExpiry, setCardExpiry] = useState<string>("08/29");
  const [cardCvc, setCardCvc] = useState<string>("742");
  const [processing, setProcessing] = useState<boolean>(false);
  const [stepMessage, setStepMessage] = useState<string>("");

  useEffect(() => {
    fetch(`/api/checkout/verify?code=${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.order) {
          setOrder(data.order);
          setCardHolder(data.order.senderName || "Titular de Tarjeta");
        }
      })
      .finally(() => setLoading(false));
  }, [code]);

  function handlePay(e: React.FormEvent) {
    e.preventDefault();
    setProcessing(true);
    setStepMessage(
      isWompi
        ? "Autorizando tarjeta Visa/Mastercard en Wompi (Banco Agrícola)..."
        : "Autorizando tarjeta en Stripe..."
    );

    setTimeout(() => {
      setStepMessage(
        "Asegurando fondos en Blink Stablesats (USD) para entrega en Chivo Wallet..."
      );
      setTimeout(() => {
        if (isWompi) {
          router.push(
            `/?wompi_return=1&session_id=${encodeURIComponent(
              sessionId
            )}&code=${encodeURIComponent(code)}`
          );
        } else {
          router.push(
            `/?stripe_session_id=${encodeURIComponent(
              sessionId
            )}&code=${encodeURIComponent(code)}`
          );
        }
      }, 900);
    }, 800);
  }

  const totalUsd = order ? (order.amountSentUsdCents / 100).toFixed(2) : "0.00";
  const netUsd = order ? (order.netPayoutUsdCents / 100).toFixed(2) : "0.00";
  const feeUsd = order ? (order.feeUsdCents / 100).toFixed(2) : "0.00";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center py-10 px-4">
      <div className="max-w-4xl w-full mx-auto grid grid-cols-1 md:grid-cols-2 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-900">
        {/* Columna Izquierda: Resumen de la Orden */}
        <div className="p-8 bg-slate-950/90 border-b md:border-b-0 md:border-r border-slate-800 flex flex-col justify-between">
          <div className="space-y-6">
            <Link
              href={`/?canceled=1&code=${encodeURIComponent(code)}`}
              className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white transition"
            >
              <ArrowLeft className="h-4 w-4" />
              Cancelar y volver a RemesasSV
            </Link>

            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold">
                <Building2 className="h-3.5 w-3.5" />
                {isWompi
                  ? "Wompi El Salvador • Banco Agrícola"
                  : "Stripe Checkout"}
              </div>
              <p className="text-xs text-slate-400 mt-3">Total a pagar (USD)</p>
              <h1 className="text-4xl font-extrabold text-white mt-1">
                ${totalUsd} <span className="text-lg font-medium text-slate-400">USD</span>
              </h1>
            </div>

            {loading ? (
              <p className="text-xs text-slate-400">Cargando detalle de la orden...</p>
            ) : order ? (
              <div className="space-y-3 pt-4 border-t border-slate-800 text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>Remesa para {order.recipientName} (Chivo Wallet)</span>
                  <strong className="text-white">${netUsd} USD</strong>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Comisión de envío</span>
                  <span>${feeUsd} USD</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Enviado por</span>
                  <span className="text-slate-200">{order.senderName}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Código de remesa</span>
                  <code className="text-amber-300 font-bold">{order.claimCode}</code>
                </div>
                <div className="flex justify-between pt-3 border-t border-slate-800 text-sm font-bold text-white">
                  <span>Total a cobrar</span>
                  <span className="text-emerald-400">${totalUsd} USD</span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="pt-8 text-[11px] text-slate-500 space-y-1.5">
            <p className="flex items-center gap-1.5 text-slate-300 font-medium">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              Acepta tarjetas Visa y Mastercard de EE.UU. y El Salvador
            </p>
            <p>
              💡 En cuanto tu cuenta bancaria en Wompi esté verificada y pegues tu{" "}
              <code className="text-amber-300">WOMPI_APP_ID</code> y{" "}
              <code className="text-amber-300">WOMPI_API_SECRET</code> en{" "}
              <Link href="/admin" className="underline text-amber-400">
                /admin
              </Link>
              , este paso abrirá directamente el enlace oficial <code>lk.wompi.sv</code>.
            </p>
          </div>
        </div>

        {/* Columna Derecha: Formulario de Tarjeta */}
        <div className="p-8 bg-slate-900 flex flex-col justify-center">
          <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-6">
            <CreditCard className="h-5 w-5 text-amber-400" />
            Pagar con tarjeta Visa o Mastercard
          </h2>

          <form onSubmit={handlePay} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Nombre en la tarjeta
              </label>
              <input
                type="text"
                required
                value={cardHolder}
                onChange={(e) => setCardHolder(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Número de tarjeta (Débito o Crédito)
              </label>
              <input
                type="text"
                required
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Vencimiento (MM/AA)
                </label>
                <input
                  type="text"
                  required
                  value={cardExpiry}
                  onChange={(e) => setCardExpiry(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  CVV / CVC
                </label>
                <input
                  type="text"
                  required
                  value={cardCvc}
                  onChange={(e) => setCardCvc(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {processing && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3.5 flex items-center gap-3 text-xs text-amber-200">
                <RefreshCw className="h-4 w-4 text-amber-400 animate-spin shrink-0" />
                <span>{stepMessage}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={processing}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold py-3.5 px-6 text-sm shadow-lg shadow-amber-500/20 transition mt-2"
            >
              <Lock className="h-4 w-4" />
              {processing
                ? "Procesando pago..."
                : `Pagar $${totalUsd} USD con Tarjeta`}
            </button>

            <div className="pt-2 flex items-center justify-center gap-2 text-[11px] text-slate-400">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span>
                Disponibilidad inmediata para cobrar en Chivo Wallet (El Salvador)
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

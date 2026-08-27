"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { IconBackspace } from "@/components/Icons";
import { Spinner, useBusy } from "@/components/Loading";
import { MESSAGES } from "@/lib/errors";

const PIN_LENGTH = 4;

export function PinForm() {
  const searchParams = useSearchParams();
  const { show, hide } = useBusy();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function appendDigit(digit: string) {
    if (loading) return;
    setError(null);
    setPin((current) =>
      current.length >= PIN_LENGTH ? current : current + digit,
    );
  }

  function backspace() {
    if (loading) return;
    setError(null);
    setPin((current) => current.slice(0, -1));
  }

  async function submit() {
    if (pin.length !== PIN_LENGTH || loading) return;
    setLoading(true);
    setError(null);
    show("Memeriksa PIN");
    try {
      const next = searchParams.get("next");
      const url =
        next && next.startsWith("/") && !next.startsWith("//")
          ? `/api/auth/login?next=${encodeURIComponent(next)}`
          : "/api/auth/login";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pin }),
      });
      const body = (await res.json()) as { message?: string; next?: string };
      if (!res.ok) {
        hide();
        setError(body.message ?? MESSAGES.invalidPin);
        setPin("");
        setLoading(false);
        return;
      }
      window.location.replace(body.next || "/");
    } catch {
      hide();
      setError(MESSAGES.network);
      setLoading(false);
    }
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  const keyClass =
    "inline-flex h-[min(3.5rem,11dvh)] min-h-12 items-center justify-center rounded-2xl bg-paper-deep text-[1.35rem] font-semibold text-white hover:bg-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40";

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-black px-5 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-[max(0.6rem,env(safe-area-inset-top))]">
      <div className="shrink-0 pt-5">
        <img
          src="/icons/icon-192.png"
          alt=""
          width={72}
          height={72}
          className="mx-auto h-[4.5rem] w-[4.5rem] rounded-[1.15rem] object-cover"
        />
        <p className="mt-4 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
          Galeri keluarga
        </p>
        <h1 className="mt-2 text-center text-[1.85rem] font-semibold leading-none tracking-tight text-white">
          Album Kita
        </h1>
        <p className="mx-auto mt-2.5 max-w-[16.5rem] text-center text-[14px] leading-snug text-muted">
          Kumpulan foto dan video kenangan spesial keluarga.
        </p>

        <div
          className="mt-6 flex items-center justify-center gap-3.5"
          aria-hidden="true"
        >
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <span
              key={i}
              className={`h-3 w-3 rounded-full transition-colors ${
                i < pin.length ? "bg-white" : "bg-white/20"
              }`}
            />
          ))}
        </div>

        <label className="sr-only" htmlFor="pin">
          PIN 4 angka
        </label>
        <input
          id="pin"
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={PIN_LENGTH}
          value={pin}
          disabled={loading}
          onChange={(e) => {
            setError(null);
            setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          className="sr-only"
        />

        {error ? (
          <p
            className="mt-3 min-h-6 text-center text-[14px] font-medium text-danger"
            role="alert"
          >
            {error}
          </p>
        ) : (
          <p className="mt-3 min-h-6" />
        )}
      </div>

      <div className="mx-auto grid w-full max-w-[19rem] flex-1 grid-cols-3 content-center gap-2 py-1">
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => appendDigit(key)}
            disabled={loading || pin.length >= PIN_LENGTH}
            className={keyClass}
          >
            {key}
          </button>
        ))}
        <span />
        <button
          type="button"
          onClick={() => appendDigit("0")}
          disabled={loading || pin.length >= PIN_LENGTH}
          className={keyClass}
        >
          0
        </button>
        <button
          type="button"
          onClick={backspace}
          disabled={loading || pin.length === 0}
          aria-label="Hapus"
          className={keyClass}
        >
          <IconBackspace className="h-5 w-5" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => void submit()}
        disabled={loading || pin.length !== PIN_LENGTH}
        className="mt-2 inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-white text-[16px] font-semibold text-black hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40"
      >
        {loading ? <Spinner size="sm" tone="dark" /> : null}
        {loading ? "Memeriksa" : "Masuk"}
      </button>
    </div>
  );
}

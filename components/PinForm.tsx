"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { IconBackspace } from "@/components/Icons";
import { Spinner, useBusy } from "@/components/Loading";
import { MESSAGES } from "@/lib/errors";

export function PinForm() {
  const searchParams = useSearchParams();
  const { show, hide } = useBusy();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function appendDigit(digit: string) {
    if (loading) return;
    setError(null);
    setPin((current) => (current.length >= 8 ? current : current + digit));
  }

  function backspace() {
    if (loading) return;
    setError(null);
    setPin((current) => current.slice(0, -1));
  }

  async function submit() {
    if (!pin || loading) return;
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
  const dots = Math.max(4, pin.length || 4);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-black px-6 pb-10 pt-16">
      <p className="text-center text-[12px] font-medium uppercase tracking-[0.22em] text-muted">
        Galeri pribadi
      </p>
      <h1 className="mt-3 text-center text-[2.4rem] font-semibold leading-none tracking-tight text-white">
        Foto Keluarga
      </h1>
      <p className="mx-auto mt-4 max-w-xs text-center text-[15px] leading-relaxed text-muted">
        Masukkan PIN untuk melihat kenangan bersama.
      </p>

      <div
        className="mt-10 flex min-h-10 items-center justify-center gap-3"
        aria-hidden="true"
      >
        {Array.from({ length: dots }).map((_, i) => (
          <span
            key={i}
            className={`h-3 w-3 rounded-full transition-colors ${
              i < pin.length ? "bg-white" : "bg-white/20"
            }`}
          />
        ))}
      </div>

      <label className="sr-only" htmlFor="pin">
        PIN
      </label>
      <input
        id="pin"
        type="password"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={pin}
        disabled={loading}
        onChange={(e) => {
          setError(null);
          setPin(e.target.value.replace(/\D/g, "").slice(0, 8));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
        className="sr-only"
      />

      {error ? (
        <p className="mt-4 text-center text-[15px] font-medium text-danger" role="alert">
          {error}
        </p>
      ) : (
        <p className="mt-4 h-6" />
      )}

      <div className="mt-2 grid grid-cols-3 gap-2.5">
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => appendDigit(key)}
            disabled={loading}
            className="inline-flex min-h-16 items-center justify-center rounded-2xl bg-paper-deep text-2xl font-semibold text-white hover:bg-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40"
          >
            {key}
          </button>
        ))}
        <span />
        <button
          type="button"
          onClick={() => appendDigit("0")}
          disabled={loading}
          className="inline-flex min-h-16 items-center justify-center rounded-2xl bg-paper-deep text-2xl font-semibold text-white hover:bg-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40"
        >
          0
        </button>
        <button
          type="button"
          onClick={backspace}
          disabled={loading}
          aria-label="Hapus"
          className="inline-flex min-h-16 items-center justify-center rounded-2xl bg-paper-deep text-white hover:bg-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40"
        >
          <IconBackspace className="h-6 w-6" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => void submit()}
        disabled={loading || pin.length === 0}
        className="mt-8 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-[16px] font-semibold text-black hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40"
      >
        {loading ? <Spinner size="sm" tone="dark" /> : null}
        {loading ? "Memeriksa" : "Masuk"}
      </button>
    </div>
  );
}

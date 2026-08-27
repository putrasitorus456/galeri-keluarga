"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconAddToHome, IconCheck, IconIosShare } from "@/components/Icons";
import { Spinner } from "@/components/Loading";
import {
  getInstallGuide,
  promptNativeInstall,
  useInstallApp,
  type InstallGuide,
} from "@/lib/install-app";

function ClientPortal({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.body);
  }, []);

  if (!target) return null;
  return createPortal(children, target);
}

const GUIDES: Record<
  InstallGuide,
  { title: string; body: string; steps: { icon?: "share" | "menu"; text: string }[] }
> = {
  "ios-safari": {
    title: "Tambahkan ke layar utama",
    body: "Di iPhone, aplikasi ditambahkan lewat Safari. Tutup petunjuk ini, lalu:",
    steps: [
      {
        icon: "share",
        text: "Ketuk tombol Bagikan (kotak dengan panah ke atas, biasanya di bawah layar).",
      },
      {
        text: "Gulir ke bawah, lalu ketuk Tambahkan ke Layar Utama.",
      },
      {
        text: "Ketuk Tambah. Setelah itu buka dari ikon Album Kita di layar HP.",
      },
    ],
  },
  "ios-other": {
    title: "Buka dulu di Safari",
    body: "Di iPhone, penambahan ke layar utama hanya bisa dari Safari, bukan Chrome.",
    steps: [
      {
        text: "Salin tautan halaman ini, lalu buka Safari.",
      },
      {
        text: "Tempel tautan di kolom alamat Safari dan buka Album Kita.",
      },
      {
        icon: "share",
        text: "Ketuk Bagikan → Tambahkan ke Layar Utama → Tambah.",
      },
    ],
  },
  android: {
    title: "Tambahkan ke layar utama",
    body: "Agar Album Kita bisa dibuka seperti aplikasi biasa.",
    steps: [
      {
        icon: "menu",
        text: "Ketuk menu Chrome (tiga titik) di kanan atas.",
      },
      {
        text: "Ketuk Instal aplikasi atau Tambahkan ke layar utama.",
      },
      {
        text: "Konfirmasi, lalu buka dari ikon Album Kita di layar HP.",
      },
    ],
  },
  desktop: {
    title: "Tambahkan ke HP",
    body: "Buka tautan Album Kita di Chrome Android atau Safari iPhone, lalu tambahkan ke layar utama.",
    steps: [
      {
        text: "Android: di Chrome, ketuk menu (tiga titik) lalu Instal aplikasi.",
      },
      {
        text: "iPhone: di Safari, ketuk Bagikan lalu Tambahkan ke Layar Utama.",
      },
    ],
  },
};

function StepIcon({ kind }: { kind?: "share" | "menu" }) {
  if (kind === "share") {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
        <IconIosShare className="h-5 w-5" />
      </span>
    );
  }
  if (kind === "menu") {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-[15px] font-semibold text-white">
        ⋮
      </span>
    );
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-[13px] font-semibold text-white">
      •
    </span>
  );
}

type InstallPhase = "loading" | "success" | "error";

export function InstallAppButton() {
  const { canPrompt, installed } = useInstallApp();
  const [open, setOpen] = useState(false);
  const [guide, setGuide] = useState<InstallGuide>("android");
  const [copied, setCopied] = useState(false);
  const [phase, setPhase] = useState<InstallPhase | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hideTimer = useRef(0);

  function dismissPopup() {
    window.clearTimeout(hideTimer.current);
    abortRef.current = null;
    setPhase(null);
  }

  function cancelInstall() {
    abortRef.current?.abort();
    dismissPopup();
  }

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      window.clearTimeout(hideTimer.current);
    };
  }, []);

  useEffect(() => {
    if (phase === "loading" && installed) {
      abortRef.current = null;
      setPhase("success");
      hideTimer.current = window.setTimeout(dismissPopup, 2000);
    }
  }, [installed, phase]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (installed && phase !== "success" && phase !== "loading") return null;

  const copy = GUIDES[guide];

  async function onClick() {
    if (phase === "loading") return;
    if (canPrompt) {
      window.clearTimeout(hideTimer.current);
      const controller = new AbortController();
      abortRef.current = controller;
      setPhase("loading");
      const result = await promptNativeInstall(controller.signal);
      if (abortRef.current !== controller) return;
      if (result === "accepted") {
        abortRef.current = null;
        setPhase("success");
        hideTimer.current = window.setTimeout(dismissPopup, 2000);
        return;
      }
      if (result === "failed") {
        abortRef.current = null;
        setPhase("error");
        return;
      }
      dismissPopup();
      if (result === "unavailable") {
        setGuide(getInstallGuide());
        setCopied(false);
        setOpen(true);
      }
      return;
    }
    setGuide(getInstallGuide());
    setCopied(false);
    setOpen(true);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      {installed ? null : (
        <button
          type="button"
          onClick={() => void onClick()}
          disabled={phase === "loading"}
          aria-label="Tambahkan ke layar utama"
          className="mt-1 inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-white/10 pl-2 pr-2.5 text-[13px] font-medium text-white hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50"
        >
          <IconAddToHome className="h-4 w-4" />
          Pasang
        </button>
      )}

      {open ? (
        <ClientPortal>
          <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="install-guide-title">
            <button
              type="button"
              className="absolute inset-0 bg-black/55"
              aria-label="Tutup"
              onClick={() => setOpen(false)}
            />
            <div className="absolute inset-x-4 bottom-[5.5rem] rounded-[1.5rem] bg-[#2c2c2e] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.45)]">
              <p id="install-guide-title" className="text-[18px] font-semibold text-white">
                {copy.title}
              </p>
              <p className="mt-1 text-[15px] leading-relaxed text-muted">{copy.body}</p>
              <ol className="mt-4 space-y-3">
                {copy.steps.map((step) => (
                  <li key={step.text} className="flex items-start gap-3">
                    <StepIcon kind={step.icon} />
                    <p className="pt-1.5 text-[15px] leading-snug text-white">{step.text}</p>
                  </li>
                ))}
              </ol>
              <div className={`mt-5 grid gap-3 ${guide === "ios-other" ? "grid-cols-2" : "grid-cols-1"}`}>
                {guide === "ios-other" ? (
                  <button
                    type="button"
                    onClick={() => void copyLink()}
                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-white text-[15px] font-semibold text-black hover:bg-white/90"
                  >
                    {copied ? "Tautan disalin" : "Salin tautan"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-white/10 text-[15px] font-semibold text-white"
                >
                  Mengerti
                </button>
              </div>
            </div>
          </div>
        </ClientPortal>
      ) : null}

      <ClientPortal>
        <InstallPopup
          phase={phase}
          onCancel={cancelInstall}
          onDismiss={dismissPopup}
        />
      </ClientPortal>
    </>
  );
}

function InstallPopup({
  phase,
  onCancel,
  onDismiss,
}: {
  phase: InstallPhase | null;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (phase === "loading") cancelRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    if (!phase) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (phase === "loading") onCancel();
      else onDismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, onDismiss, phase]);

  useEffect(() => {
    if (!phase) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [phase]);

  if (!phase) return null;

  const titleId = "install-popup-title";

  return (
    <div
      className="popup-backdrop fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/60 px-6 py-[max(1.5rem,env(safe-area-inset-top,0px))] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-live="assertive"
      onClick={phase === "loading" ? undefined : onDismiss}
    >
      <div
        key={phase}
        className="popup-card my-auto w-full max-w-[19.5rem] shrink-0 rounded-[1.6rem] bg-[#2c2c2e] px-5 pb-5 pt-7 text-center shadow-[0_18px_50px_rgba(0,0,0,0.45)]"
        onClick={(event) => event.stopPropagation()}
      >
        {phase === "loading" ? (
          <>
            <span className="relative mx-auto flex h-16 w-16 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-white/8" />
              <Spinner size="lg" />
            </span>
            <h2
              id={titleId}
              className="mt-5 text-[17px] font-semibold tracking-tight text-white"
            >
              Memasang aplikasi
            </h2>
            <p className="mt-1 text-[14px] text-muted">Mohon tunggu sebentar</p>
            <div className="progress-indeterminate mt-4 rounded-full" />
            <button
              ref={cancelRef}
              type="button"
              onClick={onCancel}
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-white/12 text-[16px] font-semibold text-white hover:bg-white/18 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Batalkan
            </button>
          </>
        ) : null}

        {phase === "success" ? (
          <>
            <span className="popup-check mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-black">
              <IconCheck className="h-8 w-8" />
            </span>
            <h2
              id={titleId}
              className="mt-5 text-[17px] font-semibold tracking-tight text-white"
            >
              Aplikasi terpasang
            </h2>
            <p className="mt-1 text-[14px] text-muted">
              Siap dibuka dari layar utama
            </p>
          </>
        ) : null}

        {phase === "error" ? (
          <>
            <h2
              id={titleId}
              className="text-[17px] font-semibold tracking-tight text-white"
            >
              Gagal memasang
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              Aplikasi tidak dapat dipasang sekarang. Coba lagi nanti.
            </p>
            <button
              type="button"
              onClick={onDismiss}
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-white text-[16px] font-semibold text-black hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Tutup
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

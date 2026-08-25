"use client";

import { useEffect, useState } from "react";
import { IconAddToHome, IconIosShare } from "@/components/Icons";
import {
  getInstallGuide,
  promptNativeInstall,
  useInstallApp,
  type InstallGuide,
} from "@/lib/install-app";

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
        text: "Ketuk Tambah. Setelah itu buka dari ikon Foto Keluarga di layar HP.",
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
        text: "Tempel tautan di kolom alamat Safari dan buka Foto Keluarga.",
      },
      {
        icon: "share",
        text: "Ketuk Bagikan → Tambahkan ke Layar Utama → Tambah.",
      },
    ],
  },
  android: {
    title: "Tambahkan ke layar utama",
    body: "Agar Foto Keluarga bisa dibuka seperti aplikasi biasa.",
    steps: [
      {
        icon: "menu",
        text: "Ketuk menu Chrome (tiga titik) di kanan atas.",
      },
      {
        text: "Ketuk Instal aplikasi atau Tambahkan ke layar utama.",
      },
      {
        text: "Konfirmasi, lalu buka dari ikon Foto Keluarga di layar HP.",
      },
    ],
  },
  desktop: {
    title: "Tambahkan ke HP",
    body: "Buka tautan Foto Keluarga di Chrome Android atau Safari iPhone, lalu tambahkan ke layar utama.",
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

export function InstallAppButton() {
  const { canPrompt, installed } = useInstallApp();
  const [open, setOpen] = useState(false);
  const [guide, setGuide] = useState<InstallGuide>("android");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (installed) return null;

  const copy = GUIDES[guide];

  async function onClick() {
    if (canPrompt) {
      await promptNativeInstall();
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
      <button
        type="button"
        onClick={() => void onClick()}
        aria-label="Tambahkan ke layar utama"
        className="inline-flex h-9 shrink-0 items-center gap-1 mt-1 rounded-full bg-white/10 pl-2 pr-2.5 text-[13px] font-medium text-white hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <IconAddToHome className="h-4 w-4" />
        Pasang
      </button>

      {open ? (
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
      ) : null}
    </>
  );
}

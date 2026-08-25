"use client";

import { useEffect, useState } from "react";
import { promptNativeInstall, useInstallApp } from "@/lib/install-app";

const STORAGE_KEY = "fk-install-dismissed";

export function InstallPrompt() {
  const { canPrompt, installed } = useInstallApp();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  if (installed || dismissed || !canPrompt) return null;

  return (
    <div className="fixed inset-x-4 bottom-[5.5rem] z-40 rounded-[1.5rem] bg-[#2c2c2e] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.45)]">
      <p className="text-[18px] font-semibold text-white">
        Tambahkan ke layar utama?
      </p>
      <p className="mt-1 text-[15px] text-muted">
        Agar lebih mudah dibuka seperti aplikasi biasa.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => void promptNativeInstall()}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-white text-[15px] font-semibold text-black hover:bg-white/90"
        >
          Tambahkan
        </button>
        <button
          type="button"
          onClick={() => {
            localStorage.setItem(STORAGE_KEY, "1");
            setDismissed(true);
          }}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-white/10 text-[15px] font-semibold text-white"
        >
          Nanti
        </button>
      </div>
    </div>
  );
}

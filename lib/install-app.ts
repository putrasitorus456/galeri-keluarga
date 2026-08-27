"use client";

import { useEffect, useSyncExternalStore } from "react";

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallGuide = "ios-safari" | "ios-other" | "android" | "desktop";

type InstallSnapshot = {
  canPrompt: boolean;
  installed: boolean;
};

const SERVER_SNAPSHOT: InstallSnapshot = {
  canPrompt: false,
  installed: false,
};

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let snapshot: InstallSnapshot = SERVER_SNAPSHOT;
let bound = false;
const listeners = new Set<() => void>();

function publish() {
  snapshot = { canPrompt: Boolean(deferred), installed };
  listeners.forEach((listener) => listener());
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    ("standalone" in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

function bindInstallEvents() {
  if (bound || typeof window === "undefined") return;
  bound = true;
  installed = isStandalone();
  snapshot = { canPrompt: Boolean(deferred), installed };
  listeners.forEach((listener) => listener());

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    publish();
  });

  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    publish();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getInstallGuide(): InstallGuide {
  const ua = navigator.userAgent;
  const iOS =
    /iPhone|iPad|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (iOS) {
    const inOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    return inOtherBrowser ? "ios-other" : "ios-safari";
  }

  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export type InstallOutcome = "accepted" | "dismissed" | "unavailable" | "aborted" | "failed";

function isAborted(signal?: AbortSignal) {
  return Boolean(signal?.aborted);
}

export async function promptNativeInstall(
  signal?: AbortSignal,
): Promise<InstallOutcome> {
  if (!deferred) return "unavailable";
  if (isAborted(signal)) return "aborted";

  const event = deferred;
  deferred = null;
  publish();

  try {
    await event.prompt();
    if (isAborted(signal)) return "aborted";

    const outcome = await new Promise<"accepted" | "dismissed" | "aborted">(
      (resolve) => {
        const onAbort = () => resolve("aborted");
        signal?.addEventListener("abort", onAbort, { once: true });
        void event.userChoice.then((choice) => {
          signal?.removeEventListener("abort", onAbort);
          resolve(choice.outcome);
        });
      },
    );

    if (outcome === "aborted") return "aborted";
    if (outcome === "accepted") {
      installed = true;
      publish();
    }
    return outcome;
  } catch {
    return "failed";
  }
}

if (typeof window !== "undefined") {
  bindInstallEvents();
}

export function useInstallApp() {
  useEffect(() => {
    bindInstallEvents();
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => SERVER_SNAPSHOT,
  );
}

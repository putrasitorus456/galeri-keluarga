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

export async function promptNativeInstall() {
  if (!deferred) return "unavailable" as const;
  const event = deferred;
  deferred = null;
  publish();
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === "accepted") {
    installed = true;
    publish();
  }
  return outcome;
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

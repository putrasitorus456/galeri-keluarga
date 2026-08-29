"use client";

import { useCallback, useEffect, useRef } from "react";

const HOLD_MS = 450;
/** Geseran sekecil ini masih dianggap diam; lebih dari itu berarti pengguna menggulir. */
const MOVE_TOLERANCE_PX = 12;

/**
 * Tekan-tahan ala galeri ponsel. Handler-nya dipasang di elemen pembungkus,
 * sehingga klik tautan di dalamnya bisa dibatalkan saat tahanan berhasil.
 * Kirim `null` untuk menonaktifkan (mis. saat mode pilih sudah aktif).
 */
export function useLongPress(onLongPress: (() => void) | null) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const triggered = useRef(false);
  const fromTouch = useRef(false);

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const start = useCallback(
    (event: React.PointerEvent) => {
      if (!onLongPress) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      cancel();
      triggered.current = false;
      fromTouch.current = event.pointerType !== "mouse";
      origin.current = { x: event.clientX, y: event.clientY };

      timer.current = window.setTimeout(() => {
        timer.current = null;
        triggered.current = true;
        navigator.vibrate?.(15);
        onLongPress();
      }, HOLD_MS);
    },
    [cancel, onLongPress],
  );

  const track = useCallback(
    (event: React.PointerEvent) => {
      const from = origin.current;
      if (!from) return;
      const moved =
        Math.abs(event.clientX - from.x) > MOVE_TOLERANCE_PX ||
        Math.abs(event.clientY - from.y) > MOVE_TOLERANCE_PX;
      if (moved) cancel();
    },
    [cancel],
  );

  const swallowClick = useCallback((event: React.MouseEvent) => {
    if (!triggered.current) return;
    triggered.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const swallowContextMenu = useCallback((event: React.MouseEvent) => {
    // Menu bawaan browser hanya diblokir untuk sentuhan, agar klik kanan di desktop tetap normal.
    if (fromTouch.current) event.preventDefault();
  }, []);

  return {
    onPointerDown: start,
    onPointerMove: track,
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onClickCapture: swallowClick,
    onContextMenu: swallowContextMenu,
  };
}

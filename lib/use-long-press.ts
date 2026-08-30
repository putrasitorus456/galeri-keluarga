"use client";

import { useCallback, useEffect, useRef } from "react";

const HOLD_MS = 450;
/** Geseran sekecil ini masih dianggap diam; lebih dari itu berarti pengguna menggulir. */
const MOVE_TOLERANCE_PX = 12;

/**
 * Tekan-tahan ala galeri ponsel. Handler-nya dipasang di elemen pembungkus.
 *
 * Penting: elemen yang disentuh tidak boleh dilepas dari DOM saat tahanan
 * memicu aksi. Browser mengirim `contextmenu` beberapa puluh milidetik setelah
 * itu, dan kalau simpulnya sudah terlepas, event-nya tidak merambat ke sini
 * sehingga menu bawaan browser tidak bisa dicegah.
 *
 * Kirim `null` untuk menonaktifkan.
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
      // Selalu disetel ulang, termasuk saat hook nonaktif, supaya sisa tahanan
      // lama tidak ikut menelan ketukan berikutnya.
      fromTouch.current = event.pointerType !== "mouse";
      triggered.current = false;
      cancel();

      if (!onLongPress) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

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

  const blockContextMenu = useCallback((event: React.MouseEvent) => {
    // Hanya untuk sentuhan, agar klik kanan di desktop tetap berperilaku normal.
    if (fromTouch.current) event.preventDefault();
  }, []);

  /** True sekali saja bila klik yang datang adalah sisa dari tahanan yang sudah terpicu. */
  const takeLongPress = useCallback(() => {
    if (!triggered.current) return false;
    triggered.current = false;
    return true;
  }, []);

  return {
    handlers: {
      onPointerDown: start,
      onPointerMove: track,
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      onContextMenu: blockContextMenu,
    },
    takeLongPress,
  };
}

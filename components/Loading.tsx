"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { hasCachedPath } from "@/lib/gallery-cache";
import {
  acquireThumbSlot,
  markThumbSeen,
  releaseThumbSlot,
  thumbWasSeen,
} from "@/lib/thumb-load";

type BusyOptions = {
  /**
   * Tetap tampil setelah pindah halaman sampai `hide()` dipanggil.
   * Dipakai navigasi album/list agar overlay tidak hilang sebelum data siap.
   */
  hold?: boolean;
};

type BusyContextValue = {
  busy: string | null;
  show: (label: string, options?: BusyOptions) => void;
  hide: () => void;
  /** Navigasi dengan overlay loading (skip jika path sudah di-cache). */
  go: (href: string, label?: string) => void;
};

const BusyContext = createContext<BusyContextValue | null>(null);

function normalizePath(href: string) {
  try {
    const url = new URL(href, "http://local.invalid");
    return url.pathname || "/";
  } catch {
    return href.split("?")[0]?.split("#")[0] || href;
  }
}

export function useBusy() {
  const value = useContext(BusyContext);
  if (!value) {
    return {
      busy: null,
      show: () => undefined,
      hide: () => undefined,
      go: (href: string) => {
        if (typeof window !== "undefined") window.location.assign(href);
      },
    } satisfies BusyContextValue;
  }
  return value;
}

export function BusyProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState<{ label: string; hold: boolean } | null>(
    null,
  );

  const show = useCallback((label: string, options?: BusyOptions) => {
    setBusy({ label, hold: Boolean(options?.hold) });
  }, []);
  const hide = useCallback(() => setBusy(null), []);

  const go = useCallback(
    (href: string, label = "Memuat") => {
      const path = normalizePath(href);
      if (path !== pathname && !hasCachedPath(path)) {
        show(label, { hold: true });
      }
      router.push(href);
    },
    [pathname, router, show],
  );

  // Overlay tanpa hold (PIN, share, dll.) hilang saat route berubah.
  // Overlay hold tetap sampai halaman tujuan memanggil hide().
  useEffect(() => {
    setBusy((current) => {
      if (!current || current.hold) return current;
      return null;
    });
  }, [pathname]);

  useEffect(() => {
    if (!busy) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => setBusy(null), 20000);
    return () => {
      document.body.style.overflow = previous;
      window.clearTimeout(timer);
    };
  }, [busy]);

  return (
    <BusyContext.Provider value={{ busy: busy?.label ?? null, show, hide, go }}>
      {children}
      {busy ? <LoadingOverlay label={busy.label} /> : null}
    </BusyContext.Provider>
  );
}

export function Spinner({
  size = "md",
  tone = "light",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  tone?: "light" | "dark";
  className?: string;
}) {
  const dim =
    size === "sm"
      ? "h-5 w-5 border-2"
      : size === "lg"
        ? "h-12 w-12 border-[3px]"
        : "h-8 w-8 border-[3px]";
  const ring =
    tone === "dark"
      ? "border-black/15 border-t-black"
      : "border-white/20 border-t-white";
  return (
    <span
      className={`inline-block animate-spin rounded-full ${ring} ${dim} ${className}`}
      aria-hidden="true"
    />
  );
}

/** Ring + spinner — tanda loading utama di seluruh app. */
export function LoadingMark({
  size = "lg",
  tone = "light",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  tone?: "light" | "dark";
  className?: string;
}) {
  const wrap =
    size === "sm" ? "h-9 w-9" : size === "md" ? "h-12 w-12" : "h-16 w-16";
  const wash = tone === "dark" ? "bg-black/6" : "bg-white/8";
  return (
    <span
      className={`relative inline-flex items-center justify-center ${wrap} ${className}`}
    >
      <span className={`absolute inset-0 rounded-full ${wash}`} />
      <Spinner size={size} tone={tone} />
    </span>
  );
}

function PulseDots({ className = "" }: { className?: string }) {
  return (
    <span className={`pulse-dots ${className}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

export function StatusCopy({
  label,
  hint,
  className = "",
}: {
  label: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <p className="text-center text-[15px] font-medium tracking-tight text-white/90">
        {label}
      </p>
      {hint ? (
        <p className="mt-1 text-center text-[13px] text-muted">{hint}</p>
      ) : null}
      <PulseDots className="mt-3 text-white" />
    </div>
  );
}

type LoadingPanelProps = {
  label?: string;
  hint?: string;
  /** Isi viewport penuh (login / halaman kosong). */
  full?: boolean;
  className?: string;
};

/** Loading in-page: ganti konten saat data belum siap. */
export function LoadingPanel({
  label = "Memuat",
  hint,
  full = false,
  className = "",
}: LoadingPanelProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center px-6 ${
        full
          ? "min-h-dvh bg-black py-16"
          : "flex-1 py-24"
      } ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <LoadingMark size="lg" />
      <StatusCopy label={label} hint={hint} className="mt-5" />
    </div>
  );
}

/** Overlay navigasi / aksi — dipakai BusyProvider, jangan pakai loading Next. */
export function LoadingOverlay({
  label,
  hint = "Mohon tunggu sebentar",
}: {
  label: string;
  hint?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex cursor-wait flex-col items-center justify-center bg-black/55 backdrop-blur-sm"
      role="status"
      aria-live="assertive"
      aria-busy="true"
    >
      <div className="progress-indeterminate absolute inset-x-0 top-0" />
      <div className="flex flex-col items-center px-6">
        <LoadingMark size="lg" />
        <StatusCopy label={label} hint={hint} className="mt-5" />
      </div>
    </div>
  );
}

/**
 * Overlay navigasi hanya jika tujuan belum punya data di cache.
 * Kembali ke list album / album yang sudah pernah dibuka harus instan.
 */
function shouldShowNavBusy(href: string, pathname: string) {
  const path = normalizePath(href);
  if (path === pathname) return false;
  return !hasCachedPath(path);
}

export function BusyLink({
  href,
  label = "Memuat",
  className,
  children,
  onClick,
  onPointerEnter,
  onPointerDown,
  prefetch,
  role,
  "aria-label": ariaLabel,
  "aria-current": ariaCurrent,
  "aria-pressed": ariaPressed,
}: {
  href: string;
  label?: string;
  className?: string;
  children: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  onPointerEnter?: React.PointerEventHandler<HTMLAnchorElement>;
  onPointerDown?: React.PointerEventHandler<HTMLAnchorElement>;
  prefetch?: boolean;
  role?: React.AriaRole;
  "aria-label"?: string;
  "aria-current"?: "page" | undefined;
  "aria-pressed"?: boolean;
}) {
  const pathname = usePathname();
  const { show } = useBusy();

  return (
    <Link
      href={href}
      prefetch={prefetch}
      role={role}
      aria-label={ariaLabel}
      aria-current={ariaCurrent}
      aria-pressed={ariaPressed}
      className={className}
      onPointerEnter={onPointerEnter}
      onPointerDown={onPointerDown}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }
        if (event.button !== 0) return;
        if (shouldShowNavBusy(href, pathname)) {
          show(label, { hold: true });
        }
      }}
    >
      {children}
    </Link>
  );
}

export function ThumbImage({
  src,
  remoteSrc,
  alt,
  className,
  eager = false,
}: {
  src: string;
  /** CDN Drive; dicoba dulu, lalu fallback ke `src` (proxy). */
  remoteSrc?: string;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const identity = `${remoteSrc ?? ""}\0${src}`;
  const warmed = thumbWasSeen(src, remoteSrc);
  const [current, setCurrent] = useState(identity);
  const [visible, setVisible] = useState(eager || warmed);
  const [activeSrc, setActiveSrc] = useState<string | null>(
    warmed ? remoteSrc || src : null,
  );
  const [loaded, setLoaded] = useState(warmed);
  const holdingSlot = useRef(false);
  const startedFor = useRef<string | null>(null);
  const usingRemote = useRef(Boolean(remoteSrc));

  if (identity !== current) {
    const nextWarm = thumbWasSeen(src, remoteSrc);
    setCurrent(identity);
    setLoaded(nextWarm);
    setActiveSrc(nextWarm ? remoteSrc || src : null);
    setVisible(eager || nextWarm);
    usingRemote.current = Boolean(remoteSrc);
  }

  useEffect(() => {
    startedFor.current = null;
    if (holdingSlot.current) {
      releaseThumbSlot();
      holdingSlot.current = false;
    }
  }, [identity]);

  useEffect(() => {
    if (eager || thumbWasSeen(src, remoteSrc)) {
      setVisible(true);
      return;
    }
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [eager, identity, remoteSrc, src]);

  useEffect(() => {
    if (!visible) return;
    if (startedFor.current === identity) return;
    startedFor.current = identity;
    usingRemote.current = Boolean(remoteSrc);

    // Preview yang pernah tampil: jangan antri slot lagi — biar kembali ke list instan.
    if (thumbWasSeen(src, remoteSrc)) {
      setActiveSrc(remoteSrc || src);
      setLoaded(true);
      return;
    }

    let cancelled = false;
    void acquireThumbSlot().then(() => {
      if (cancelled) {
        releaseThumbSlot();
        if (startedFor.current === identity) startedFor.current = null;
        return;
      }
      holdingSlot.current = true;
      setActiveSrc(remoteSrc || src);
    });

    return () => {
      cancelled = true;
    };
  }, [identity, visible, remoteSrc, src]);

  useEffect(() => {
    return () => {
      if (holdingSlot.current) {
        releaseThumbSlot();
        holdingSlot.current = false;
      }
    };
  }, []);

  function releaseSlot() {
    if (holdingSlot.current) {
      releaseThumbSlot();
      holdingSlot.current = false;
    }
  }

  function finish() {
    markThumbSeen(src, remoteSrc);
    setLoaded(true);
    releaseSlot();
  }

  function handleError() {
    if (usingRemote.current && remoteSrc && src !== remoteSrc) {
      usingRemote.current = false;
      setLoaded(false);
      setActiveSrc(src);
      return;
    }
    finish();
  }

  return (
    <span ref={rootRef} className="absolute inset-0 block overflow-hidden">
      {loaded ? null : (
        <span className="absolute inset-0 animate-pulse bg-[#1c1c1e]" />
      )}
      {activeSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={activeSrc}
          alt={alt}
          fetchPriority={eager || warmed ? "high" : "low"}
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          onLoadStart={releaseSlot}
          onLoad={finish}
          onError={handleError}
          className={`${className ?? ""} ${loaded ? "opacity-100" : "opacity-0"} ${
            warmed ? "" : "transition-opacity duration-200"
          }`}
        />
      ) : null}
    </span>
  );
}

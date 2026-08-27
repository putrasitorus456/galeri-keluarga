"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type BusyContextValue = {
  busy: string | null;
  show: (label: string) => void;
  hide: () => void;
};

const BusyContext = createContext<BusyContextValue | null>(null);

export function useBusy() {
  const value = useContext(BusyContext);
  if (!value) {
    return {
      busy: null,
      show: () => undefined,
      hide: () => undefined,
    };
  }
  return value;
}

export function BusyProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [busy, setBusy] = useState<string | null>(null);
  const show = useCallback((label: string) => setBusy(label), []);
  const hide = useCallback(() => setBusy(null), []);

  useEffect(() => {
    setBusy(null);
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
    <BusyContext.Provider value={{ busy, show, hide }}>
      {children}
      {busy ? <BusyOverlay label={busy} /> : null}
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
    size === "sm" ? "h-5 w-5 border-2" : size === "lg" ? "h-12 w-12 border-[3px]" : "h-8 w-8 border-[3px]";
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
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <p className="text-center text-[15px] font-medium tracking-tight text-white/90">
        {label}
      </p>
      <PulseDots className="mt-3 text-white" />
    </div>
  );
}

export function LoadingPanel({ label }: { label: string }) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center px-6 py-24"
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-16 w-16 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-white/8" />
        <Spinner size="lg" />
      </span>
      <StatusCopy label={label} className="mt-5" />
    </div>
  );
}

function BusyOverlay({ label }: { label: string }) {
  return (
    <div
      className="fixed inset-0 z-[80] flex cursor-wait flex-col items-center justify-center bg-black/55 backdrop-blur-sm"
      role="status"
      aria-live="assertive"
    >
      <div className="progress-indeterminate absolute inset-x-0 top-0" />
      <span className="relative flex h-16 w-16 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-white/10" />
        <Spinner size="lg" />
      </span>
      <StatusCopy label={label} className="mt-5 px-6" />
    </div>
  );
}

export function BusyLink({
  href,
  className,
  children,
  onClick,
  onPointerEnter,
  onPointerDown,
  prefetch,
  "aria-label": ariaLabel,
  "aria-current": ariaCurrent,
}: {
  href: string;
  label?: string;
  className?: string;
  children: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  onPointerEnter?: React.PointerEventHandler<HTMLAnchorElement>;
  onPointerDown?: React.PointerEventHandler<HTMLAnchorElement>;
  prefetch?: boolean;
  "aria-label"?: string;
  "aria-current"?: "page" | undefined;
}) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      aria-label={ariaLabel}
      aria-current={ariaCurrent}
      className={className}
      onPointerEnter={onPointerEnter}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}

export function ThumbImage({
  src,
  alt,
  className,
  eager = false,
}: {
  src: string;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  const [current, setCurrent] = useState(src);
  const [loaded, setLoaded] = useState(false);
  if (src !== current) {
    setCurrent(src);
    setLoaded(false);
  }

  return (
    <>
      {loaded ? null : <span className="absolute inset-0 bg-[#1c1c1e]" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "low"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className={`${className ?? ""} ${loaded ? "opacity-100" : "opacity-0"} transition-opacity duration-200`}
      />
    </>
  );
}

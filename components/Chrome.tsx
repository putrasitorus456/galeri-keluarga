"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { prefetchLibrary } from "@/lib/gallery-cache";
import { BusyLink } from "@/components/Loading";

export const iconBtnClass =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/90 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40";

export function IconButton({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`${iconBtnClass} ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

export type ActionItem = {
  id: string;
  label: string;
  onClick: () => void;
};

export function ActionMenu({
  open,
  onClose,
  items,
  align = "right",
}: {
  open: boolean;
  onClose: () => void;
  items: ActionItem[];
  align?: "left" | "right";
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label="Tutup menu"
        onClick={onClose}
      />
      <div
        role="menu"
        className={`absolute top-[3.75rem] min-w-[13.5rem] overflow-hidden rounded-2xl bg-[#2c2c2e] py-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.45)] ${
          align === "right" ? "right-3" : "left-3"
        }`}
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            onClick={() => {
              item.onClick();
              onClose();
            }}
            className="flex min-h-12 w-full items-center px-4 text-left text-[15px] font-medium text-white hover:bg-white/8"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function BottomDock() {
  const pathname = usePathname();
  const active =
    pathname.startsWith("/tipe/foto")
      ? "foto"
      : pathname.startsWith("/tipe/video")
        ? "video"
        : "album";

  const tabs = [
    { id: "foto", href: "/tipe/foto", label: "Foto", busy: "Memuat foto" },
    { id: "album", href: "/", label: "Album", busy: "Memuat album" },
    { id: "video", href: "/tipe/video", label: "Video", busy: "Memuat video" },
  ] as const;

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.7rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-md gap-2">
        {tabs.map((tab) => {
          const isActive = active === tab.id;
          return (
            <BusyLink
              key={tab.id}
              href={tab.href}
              label={tab.busy}
              prefetch
              onPointerEnter={() => {
                if (tab.id === "foto" || tab.id === "video") void prefetchLibrary();
              }}
              aria-current={isActive ? "page" : undefined}
              className={`glass-tab pointer-events-auto flex h-12 flex-1 items-center justify-center rounded-full text-[15px] font-medium tracking-tight transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                isActive
                  ? "glass-tab-active text-white"
                  : "text-white/70 hover:text-white"
              }`}
            >
              {tab.label}
            </BusyLink>
          );
        })}
      </div>
    </nav>
  );
}

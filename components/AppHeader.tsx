"use client";

import { iconBtnClass } from "@/components/Chrome";
import { IconBack } from "@/components/Icons";
import { BusyLink } from "@/components/Loading";

type HeaderProps = {
  title: string;
  subtitle?: string;
  titleAction?: React.ReactNode;
  backHref?: string;
  actions?: React.ReactNode;
  large?: boolean;
};

export function AppHeader({
  title,
  subtitle,
  titleAction,
  backHref,
  actions,
  large = false,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 bg-black/90 pt-[calc(env(safe-area-inset-top,0px)+0.9rem)] backdrop-blur-md">
      <div
        className={`flex items-center gap-0.5 ${
          large ? "min-h-14 px-3 pb-2 pt-1" : "min-h-[3.75rem] px-1.5 pb-2 pt-1"
        }`}
      >
        {backHref ? (
          <BusyLink href={backHref} label="Kembali" aria-label="Kembali" className={iconBtnClass}>
            <IconBack className="h-6 w-6" />
          </BusyLink>
        ) : null}

        <div className={`min-w-0 flex-1 ${large ? "pl-1" : "px-1"}`}>
          <div className="flex items-center gap-2">
            <h1
              className={`truncate font-semibold tracking-tight text-white ${
                large
                  ? "text-[2rem] leading-none"
                  : "text-[1.35rem] leading-tight"
              }`}
            >
              {title}
            </h1>
            {titleAction}
          </div>
          {subtitle ? (
            <p className="mt-0.5 truncate text-[13px] text-muted">{subtitle}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center">{actions}</div>
      </div>
    </header>
  );
}

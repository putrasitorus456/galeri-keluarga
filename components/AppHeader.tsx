"use client";

import { useRouter } from "next/navigation";
import { iconBtnClass } from "@/components/Chrome";
import { IconBack } from "@/components/Icons";

type HeaderProps = {
  title: string;
  subtitle?: string;
  titleAction?: React.ReactNode;
  backHref?: string;
  actions?: React.ReactNode;
  large?: boolean;
};

function BackButton({ href }: { href: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      aria-label="Kembali"
      className={iconBtnClass}
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(href);
      }}
    >
      <IconBack className="h-6 w-6" />
    </button>
  );
}

export function AppHeader({
  title,
  subtitle,
  titleAction,
  backHref,
  actions,
  large = false,
}: HeaderProps) {
  const stackedTitle = !large && Boolean(backHref);

  return (
    <header className="sticky top-0 z-20 bg-black/90 pt-[calc(env(safe-area-inset-top,0px)+0.9rem)] backdrop-blur-md">
      <div
        className={`flex items-center gap-0.5 ${
          large
            ? "min-h-14 px-3 pb-2 pt-1"
            : stackedTitle
              ? "min-h-11 px-1.5 pt-1"
              : "min-h-[3.75rem] px-1.5 pb-2 pt-1"
        }`}
      >
        {backHref ? <BackButton href={backHref} /> : null}

        {stackedTitle ? null : (
          <div className={`min-w-0 flex-1 ${large ? "pl-1" : "px-1"}`}>
            <div className="flex min-w-0 items-center gap-2">
              <h1
                title={title}
                className={`min-w-0 flex-1 font-semibold tracking-tight text-white ${
                  large
                    ? "truncate text-[2rem] leading-none"
                    : "line-clamp-2 text-[1.2rem] leading-snug break-words"
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
        )}

        <div
          className={`flex shrink-0 items-center ${stackedTitle ? "ml-auto" : ""}`}
        >
          {actions}
        </div>
      </div>

      {stackedTitle ? (
        <div className="px-4 pb-2.5">
          <h1
            title={title}
            className="line-clamp-2 text-[1.35rem] font-semibold leading-snug tracking-tight break-words text-white"
          >
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-0.5 truncate text-[13px] text-muted">{subtitle}</p>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}

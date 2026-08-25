"use client";

import { IconPhoto } from "@/components/Icons";
import { useBusy } from "@/components/Loading";

type EmptyStateProps = {
  message: string;
};

export function EmptyState({ message }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-20">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-paper-deep text-muted">
        <IconPhoto className="h-8 w-8" />
      </span>
      <p className="mt-5 max-w-sm text-center text-[16px] leading-relaxed text-muted">
        {message}
      </p>
    </div>
  );
}

type ErrorStateProps = {
  message: string;
  onRetry?: () => void;
};

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  const { show } = useBusy();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-20">
      <p className="max-w-sm text-center text-[16px] leading-relaxed text-white">
        {message}
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={() => {
            show("Mencoba lagi");
            onRetry();
          }}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-7 text-[15px] font-semibold text-black hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Coba lagi
        </button>
      ) : null}
    </div>
  );
}

export function AlbumSkeleton() {
  return (
    <div className="space-y-8 px-4 pt-3">
      <div>
        <div className="mb-3 h-5 w-24 animate-pulse rounded bg-paper-deep" />
        <div className="grid grid-cols-3 gap-x-3 gap-y-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center">
              <div className="aspect-square w-full animate-pulse rounded-[1.15rem] bg-paper-deep" />
              <div className="mt-2 h-3 w-16 animate-pulse rounded bg-paper-deep" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-3 h-5 w-32 animate-pulse rounded bg-paper-deep" />
        <div className="h-[7.5rem] animate-pulse rounded-[1.15rem] bg-paper-deep" />
      </div>
    </div>
  );
}

export function MediaSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-px sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
      {Array.from({ length: 18 }).map((_, i) => (
        <div key={i} className="aspect-square animate-pulse bg-paper-deep" />
      ))}
    </div>
  );
}

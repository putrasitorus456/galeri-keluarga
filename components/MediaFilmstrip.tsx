"use client";

import { useEffect, useRef } from "react";
import type { MediaItem } from "@/lib/types";
import { IconPlay } from "@/components/Icons";

const THUMB_RADIUS = 60;

export function MediaFilmstrip({
  items,
  currentId,
  onSelect,
}: {
  items: MediaItem[];
  currentId: string;
  onSelect: (id: string) => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);
  const firstRun = useRef(true);
  const currentIndex = items.findIndex((item) => item.id === currentId);

  useEffect(() => {
    const strip = stripRef.current;
    const current = currentRef.current;
    if (!strip || !current) return;
    const left =
      current.offsetLeft - strip.clientWidth / 2 + current.clientWidth / 2;
    strip.scrollTo({ left, behavior: firstRun.current ? "auto" : "smooth" });
    firstRun.current = false;
  }, [currentId, items.length]);

  if (items.length < 2) return null;

  return (
    <div
      ref={stripRef}
      className="no-scrollbar flex shrink-0 items-center gap-2 overflow-x-auto px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2"
      role="listbox"
      aria-label="Pratinjau foto album"
    >
      {items.map((item, itemIndex) => {
        const selected = item.id === currentId;
        const near =
          currentIndex < 0 || Math.abs(itemIndex - currentIndex) <= THUMB_RADIUS;
        return (
          <button
            key={item.id}
            ref={selected ? currentRef : undefined}
            type="button"
            role="option"
            aria-selected={selected}
            aria-label={item.name}
            onClick={() => onSelect(item.id)}
            className={`relative h-[3.75rem] w-[3.75rem] shrink-0 overflow-hidden rounded-xl bg-[#1c1c1e] transition-[transform,opacity,box-shadow] duration-300 ease-out ${
              selected
                ? "scale-100 opacity-100 shadow-[0_0_0_2px_#fff]"
                : "scale-[0.84] opacity-55 hover:scale-90 hover:opacity-80"
            }`}
          >
            {near ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.thumbnailUrl}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                className="h-full w-full object-cover"
              />
            ) : null}
            {item.type === "video" ? (
              <span className="absolute bottom-1 left-1 rounded-md bg-black/70 p-0.5 text-white">
                <IconPlay className="h-3 w-3" />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

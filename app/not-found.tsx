import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { MESSAGES } from "@/lib/errors";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center bg-black px-6 text-center">
      <BrandMark size="sm" />
      <p className="mt-8 text-[16px] leading-relaxed text-white">{MESSAGES.notFound}</p>
      <Link
        href="/"
        className="mt-7 inline-flex min-h-11 items-center justify-center rounded-full bg-white px-6 font-semibold text-black hover:bg-white/90"
      >
        Kembali
      </Link>
    </main>
  );
}

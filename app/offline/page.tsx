import { BrandMark } from "@/components/BrandMark";
import { MESSAGES } from "@/lib/errors";

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center bg-black px-6 text-center">
      <BrandMark size="md" />
      <h1 className="mt-8 text-2xl font-semibold text-white">
        {MESSAGES.offlineTitle}
      </h1>
      <p className="mt-3 text-[16px] leading-relaxed text-muted">
        {MESSAGES.offlineBody}
      </p>
    </main>
  );
}

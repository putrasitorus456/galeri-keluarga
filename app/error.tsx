"use client";

import { ErrorState } from "@/components/States";
import { userMessage } from "@/lib/api-client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="min-h-dvh bg-black">
      <ErrorState message={userMessage(error)} onRetry={reset} />
    </main>
  );
}

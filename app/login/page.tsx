import { Suspense } from "react";
import { PinForm } from "@/components/PinForm";
import { LoadingPanel } from "@/components/Loading";

export default function LoginPage() {
  return (
    <main className="min-h-dvh">
      <Suspense
        fallback={
          <div className="flex min-h-dvh flex-col bg-black">
            <LoadingPanel label="Memuat" />
          </div>
        }
      >
        <PinForm />
      </Suspense>
    </main>
  );
}

import { Suspense } from "react";
import { PinForm } from "@/components/PinForm";
import { LoadingPanel } from "@/components/Loading";

export default function LoginPage() {
  return (
    <main className="min-h-dvh">
      <Suspense fallback={<LoadingPanel label="Memuat" full />}>
        <PinForm />
      </Suspense>
    </main>
  );
}

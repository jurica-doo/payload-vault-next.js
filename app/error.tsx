"use client";

import { useEffect } from "react";
import { ErrorBlock } from "@/components/errorBlock/ErrorBlock";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-color-bg-main">
      <ErrorBlock
        message="Beim Laden dieser Seite ist ein unerwarteter Fehler aufgetreten. Bitte versuchen Sie es erneut."
        onRetry={() => unstable_retry()}
      />
    </main>
  );
}

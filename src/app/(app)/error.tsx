"use client";
import { Button, Card } from "@/components/ui";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card className="mx-auto mt-16 max-w-md p-8 text-center">
      <p className="text-sm font-semibold">Something went wrong loading this page.</p>
      <p className="mt-2 text-xs text-muted">{error.digest ? `Reference: ${error.digest}` : error.message}</p>
      <Button className="mt-5" onClick={reset}>Try again</Button>
    </Card>
  );
}

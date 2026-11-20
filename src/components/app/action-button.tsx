"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import type { buttonVariants } from "@/components/ui";
import type { VariantProps } from "class-variance-authority";

/**
 * POSTs to an API route and refreshes the page. In demo mode it is disabled with an explanation,
 * because demo mode never performs or simulates external actions.
 */
export function ActionButton({
  endpoint, body, children, demo, confirm, variant, size, method = "POST", successText,
}: {
  endpoint: string; body?: unknown; children: React.ReactNode; demo?: boolean; confirm?: string; method?: "POST" | "PATCH" | "DELETE";
  successText?: string;
} & VariantProps<typeof buttonVariants>) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (demo) {
    return (
      <span title="Demo mode — connect Supabase to enable actions" className="inline-flex">
        <Button variant={variant} size={size} disabled>{children}</Button>
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        variant={variant}
        size={size}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setMsg(null);
          start(async () => {
            const res = await fetch(endpoint, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) setMsg({ ok: false, text: json.error ?? `Failed (${res.status})` });
            else {
              setMsg(successText ? { ok: true, text: successText } : null);
              router.refresh();
            }
          });
        }}
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {children}
      </Button>
      {msg ? <span className={msg.ok ? "text-[11px] text-ok" : "text-[11px] text-danger"}>{msg.text}</span> : null}
    </span>
  );
}

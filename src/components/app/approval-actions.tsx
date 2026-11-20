"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { Button, Input } from "@/components/ui";

export function ApprovalActions({ id, updatedAt, demo, disabled }: { id: string; updatedAt: string; demo: boolean; disabled: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const decide = (decision: "approved" | "rejected") => start(async () => {
    const res = await fetch(`/api/approvals/${id}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, note: note || undefined, expectedUpdatedAt: updatedAt }),
    });
    if (!res.ok) setErr(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Failed");
    else router.refresh();
  });
  const off = demo || disabled || pending;
  return (
    <div className="flex w-full flex-col gap-2 sm:w-56">
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" disabled={off} />
      <div className="flex gap-2">
        <Button variant="ok" className="flex-1" disabled={off} onClick={() => decide("approved")}><Check className="h-4 w-4" />Approve</Button>
        <Button variant="danger" className="flex-1" disabled={off} onClick={() => decide("rejected")}><X className="h-4 w-4" />Reject</Button>
      </div>
      {demo ? <p className="text-[11px] text-muted">Demo mode — decisions disabled.</p> : null}
      {err ? <p className="text-[11px] text-danger">{err}</p> : null}
    </div>
  );
}

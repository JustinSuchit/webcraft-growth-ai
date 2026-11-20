"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Select, Textarea } from "@/components/ui";
import { PROSPECT_STATUSES } from "@/lib/db/types";

export function ProspectStatusForm({ id, status, demo }: { id: string; status: string; demo: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-2 pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await fetch(`/api/prospects/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: value, note: note || undefined }) });
          if (!res.ok) setErr(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Failed");
          else { setErr(null); setNote(""); router.refresh(); }
        });
      }}
    >
      <Select value={value} onChange={(e) => setValue(e.target.value)} disabled={demo} aria-label="Status">
        {PROSPECT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </Select>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional)" disabled={demo} className="min-h-16" />
      <Button type="submit" size="sm" disabled={demo || pending}>{demo ? "Demo mode" : "Save"}</Button>
      {value === "do_not_contact" && status !== "do_not_contact" ? <p className="text-[11px] text-danger">This adds all of this prospect’s emails to the suppression list.</p> : null}
      {err ? <p className="text-[11px] text-danger">{err}</p> : null}
    </form>
  );
}

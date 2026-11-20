"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Input } from "@/components/ui";

export function SettingsForm({ demo, canEdit, settings, identity }: { demo: boolean; canEdit: boolean; settings: Record<string, number>; identity: Record<string, string> }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const off = demo || !canEdit;
  return (
    <form
      className="space-y-4 p-5 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const res = await fetch("/api/settings", {
            method: "PATCH", headers: { "content-type": "application/json" },
            body: JSON.stringify({
              settings: { daily_prospect_target: Number(fd.get("daily_prospect_target")), posts_per_week: Number(fd.get("posts_per_week")), daily_email_cap: Number(fd.get("daily_email_cap")) },
              sender_identity: { legalName: fd.get("legalName"), senderName: fd.get("senderName"), postalAddress: fd.get("postalAddress"), website: fd.get("website"), replyTo: fd.get("replyTo") },
            }),
          });
          setMsg(res.ok ? "Saved" : ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Failed");
          if (res.ok) router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-3 gap-3">
        <label><span className="text-xs text-muted">Prospects / day</span><Input name="daily_prospect_target" type="number" min={1} max={25} defaultValue={settings.daily_prospect_target ?? 10} disabled={off} /></label>
        <label><span className="text-xs text-muted">Posts / week</span><Input name="posts_per_week" type="number" min={1} max={7} defaultValue={settings.posts_per_week ?? 4} disabled={off} /></label>
        <label><span className="text-xs text-muted">Email cap / day</span><Input name="daily_email_cap" type="number" min={1} max={150} defaultValue={settings.daily_email_cap ?? 40} disabled={off} /></label>
      </div>
      <p className="text-xs font-medium">Sender identity (used in every email footer)</p>
      <div className="grid grid-cols-2 gap-3">
        <label><span className="text-xs text-muted">Legal / trading name</span><Input name="legalName" defaultValue={identity.legalName ?? "WebCraft TT"} disabled={off} /></label>
        <label><span className="text-xs text-muted">Sender name</span><Input name="senderName" defaultValue={identity.senderName ?? ""} placeholder="Your name" disabled={off} /></label>
        <label className="col-span-2"><span className="text-xs text-muted">Postal address</span><Input name="postalAddress" defaultValue={identity.postalAddress ?? ""} placeholder="Required for outreach" disabled={off} /></label>
        <label><span className="text-xs text-muted">Website</span><Input name="website" defaultValue={identity.website ?? ""} disabled={off} /></label>
        <label><span className="text-xs text-muted">Reply-to (SMTP mode)</span><Input name="replyTo" type="email" defaultValue={identity.replyTo ?? ""} disabled={off} /></label>
      </div>
      <Button type="submit" variant="primary" disabled={off || pending}>{demo ? "Demo mode" : "Save settings"}</Button>
      {msg ? <span className="ml-3 text-xs text-muted">{msg}</span> : null}
    </form>
  );
}

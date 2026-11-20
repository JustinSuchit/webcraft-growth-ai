"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Input, Select } from "@/components/ui";
import { COUNTRY, label } from "@/lib/utils";
import { INDUSTRIES, SERVICES } from "@/lib/db/types";

export function CampaignForm({ demo }: { demo: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="space-y-3 p-5 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const res = await fetch("/api/campaigns", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: fd.get("name"), services: fd.getAll("services"), industry: fd.get("industry") || undefined,
              country: fd.get("country") || undefined, minScore: Number(fd.get("minScore")),
              dailyCap: Number(fd.get("dailyCap")), totalCap: Number(fd.get("totalCap")), days: Number(fd.get("days")),
            }),
          });
          const json = (await res.json().catch(() => ({}))) as { error?: string; recipients?: number };
          setMsg(res.ok ? `Created with ${json.recipients} recipients — approve it in the Approval Queue.` : json.error ?? "Failed");
          if (res.ok) router.refresh();
        });
      }}
    >
      <label className="block"><span className="text-xs text-muted">Name</span><Input name="name" required placeholder="T&T hardware stores — online catalogues" /></label>
      <fieldset><legend className="text-xs text-muted">Services</legend>
        <div className="mt-1 flex flex-wrap gap-2">{SERVICES.filter((s) => s !== "other").map((s) => (
          <label key={s} className="flex items-center gap-1 text-xs"><input type="checkbox" name="services" value={s} /> {label(s)}</label>
        ))}</div>
      </fieldset>
      <div className="grid grid-cols-2 gap-2">
        <label><span className="text-xs text-muted">Industry</span><Select name="industry"><option value="">Any</option>{INDUSTRIES.map((i) => <option key={i} value={i}>{label(i)}</option>)}</Select></label>
        <label><span className="text-xs text-muted">Country</span><Select name="country"><option value="">Any</option>{Object.entries(COUNTRY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></label>
        <label><span className="text-xs text-muted">Min. score</span><Input name="minScore" type="number" min={0} max={100} defaultValue={60} /></label>
        <label><span className="text-xs text-muted">Runs for (days)</span><Input name="days" type="number" min={1} max={60} defaultValue={14} /></label>
        <label><span className="text-xs text-muted">Daily cap</span><Input name="dailyCap" type="number" min={1} max={50} defaultValue={8} /></label>
        <label><span className="text-xs text-muted">Total cap</span><Input name="totalCap" type="number" min={1} max={200} defaultValue={25} /></label>
      </div>
      <Button type="submit" variant="primary" disabled={demo || pending} className="w-full">{demo ? "Demo mode" : pending ? "Creating…" : "Create & request approval"}</Button>
      {msg ? <p className="text-xs text-muted">{msg}</p> : null}
    </form>
  );
}

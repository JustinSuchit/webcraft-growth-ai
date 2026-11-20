"use client";
import { useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import { createBrowser } from "@/lib/supabase/browser";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [err, setErr] = useState("");
  return (
    <Card className="p-6">
      {state === "sent" ? (
        <p className="text-sm">Check <strong>{email}</strong> for a sign-in link.</p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const sb = createBrowser();
            if (!sb) return;
            setState("sending");
            const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/auth/callback`, shouldCreateUser: true } });
            if (error) { setErr(error.message); setState("error"); } else setState("sent");
          }}
        >
          <label className="block text-sm"><span className="text-xs text-muted">Work email</span><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@webcraft.tt" /></label>
          <Button variant="primary" className="w-full" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Email me a sign-in link"}</Button>
          {state === "error" ? <p className="text-xs text-danger">{err}</p> : null}
          <p className="text-[11px] text-muted">Tip: disable public sign-ups in Supabase Auth and invite team members instead.</p>
        </form>
      )}
    </Card>
  );
}

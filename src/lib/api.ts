import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { isDemoMode } from "@/lib/env";

/** Uniform JSON errors for route handlers. Thrown `Response`s (401/403) pass through. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof Response) return NextResponse.json({ error: await err.text() }, { status: err.status });
      if (err instanceof ZodError) return NextResponse.json({ error: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
      console.error(JSON.stringify({ level: "error", route: true, message: (err as Error).message }));
      return NextResponse.json({ error: (err as Error).message ?? "Internal error" }, { status: 500 });
    }
  };
}

export function rejectInDemo() {
  if (isDemoMode()) throw new Response("Demo mode: connect Supabase to enable this action", { status: 409 });
}

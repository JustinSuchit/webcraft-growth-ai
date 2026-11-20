export const dynamic = "force-dynamic";
import { LoginForm } from "@/components/app/login-form";
import { isDemoMode } from "@/lib/env";
import { redirect } from "next/navigation";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  if (isDemoMode()) redirect("/");
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-fg text-sm font-black text-bg">W</span>
          <div><p className="font-semibold">WebCraft Growth AI</p><p className="text-xs text-muted">Team sign-in</p></div>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}

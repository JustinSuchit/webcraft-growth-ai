export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { Button, Card, Input } from "@/components/ui";
import { isDemoMode } from "@/lib/env";
import { createUserClient } from "@/lib/supabase/server";

export const metadata = { title: "Set up workspace" };

async function createOrg(formData: FormData) {
  "use server";
  const supabase = await createUserClient();
  const name = String(formData.get("name") ?? "WebCraft TT").slice(0, 80);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "webcraft";
  const { error } = await supabase.rpc("create_organization", { p_name: name, p_slug: slug });
  if (error) throw new Error(error.message);
  redirect("/settings");
}

export default async function Onboarding() {
  if (isDemoMode()) redirect("/");
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <Card className="w-full max-w-md p-6">
        <h1 className="text-lg font-semibold">Create your workspace</h1>
        <p className="mt-1 text-sm text-muted">You’ll be the owner. The five agents are created ready to run; anything external they produce waits for your approval.</p>
        <form action={createOrg} className="mt-5 space-y-3">
          <Input name="name" defaultValue="WebCraft TT" required />
          <Button variant="primary" className="w-full">Create workspace</Button>
        </form>
      </Card>
    </div>
  );
}

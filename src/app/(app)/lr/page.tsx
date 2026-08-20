import Link from "next/link";
import { Lock } from "lucide-react";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { Button } from "@/components/ui/button";
import { LrForm } from "@/components/lr/lr-form";
import { loadLrFormData } from "./form-data";

export const dynamic = "force-dynamic";

export default async function LrEntryPage({
  searchParams,
}: {
  searchParams: { id?: string; copy?: string };
}) {
  await authorize(requireSession(), "lr", "view");
  const data = await loadLrFormData(searchParams.id, searchParams.copy);

  // a billed LR changes only through its bill's preview — editing it here
  // would silently rewrite the bill behind the user's back
  if (data.mode === "edit" && data.isBilled) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">LR Entry — {data.defaults.lrNo}</h1>
        <div className="flex max-w-xl flex-col items-start gap-3 rounded-lg border bg-card p-6">
          <div className="flex items-center gap-2 font-semibold">
            <Lock className="h-4 w-4" /> Is LR ka bill ban chuka hai
          </div>
          <p className="text-sm text-muted-foreground">
            LR {data.defaults.lrNo} kisi bill par hai, isliye yahan se edit nahi hoga. Edit karne
            ke liye Billing Register se uska bill kholo — bill ke preview mein LR ke aage
            &quot;Edit&quot; ka option hai. Wahan se badalne par bill ke totals bhi saamne hi update
            hote hain.
          </p>
          <div className="flex gap-2">
            <Button asChild size="sm">
              <Link href="/billing/register?kind=FULL_TRUCK">Billing Register</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/lr/register">LR Register</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">
        LR Entry{data.mode === "edit" ? ` — ${data.defaults.lrNo}` : ""}
      </h1>
      <LrForm key={data.lrId ?? "new"} {...data} isDummy={data.isDummy} />
    </div>
  );
}

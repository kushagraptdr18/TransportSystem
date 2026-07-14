import { LrForm } from "@/components/lr/lr-form";
import { loadLrFormData } from "./form-data";

export const dynamic = "force-dynamic";

export default async function LrEntryPage({
  searchParams,
}: {
  searchParams: { id?: string; copy?: string };
}) {
  const data = await loadLrFormData(searchParams.id, searchParams.copy);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">
        LR Entry{data.mode === "edit" ? ` — ${data.defaults.lrNo}` : ""}
      </h1>
      <LrForm key={data.lrId ?? "new"} {...data} isDummy={false} />
    </div>
  );
}

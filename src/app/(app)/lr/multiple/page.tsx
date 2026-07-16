import { loadLrFormData } from "../form-data";
import { MultiLrBatch } from "@/components/lr/multi-lr-form";

export const dynamic = "force-dynamic";

export default async function MultipleLrPage() {
  const data = await loadLrFormData();
  // strip fields the batch wrapper supplies itself
  const { mode: _mode, lrId: _lrId, ...formProps } = data;
  void _mode;
  void _lrId;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Multiple LR Entry</h1>
      <MultiLrBatch {...formProps} />
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { MasterCombobox, type MasterOption } from "@/components/data/master-combobox";

/** shared picker for the 360° screens — choosing navigates in place */
export function Picker360({
  options,
  value,
  base,
  placeholder,
}: {
  options: MasterOption[];
  value: string | null;
  base: string;
  placeholder: string;
}) {
  const router = useRouter();
  return (
    <div className="w-72">
      <MasterCombobox
        options={options}
        value={value}
        onChange={(v) => v && router.push(`${base}?id=${v}`)}
        placeholder={placeholder}
      />
    </div>
  );
}

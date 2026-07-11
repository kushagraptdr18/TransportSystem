"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { MasterCombobox, type MasterOption } from "@/components/data/master-combobox";
import { saveFirmSettings } from "@/app/(app)/settings/firm/actions";

export interface FirmFormValues {
  name: string;
  alias: string;
  address1: string;
  address2: string;
  stateId: string;
  cityId: string;
  phone: string;
  mobile: string;
  email: string;
  website: string;
  gstin: string;
  pan: string;
  cin: string;
  msmeNo: string;
  jurisdiction: string;
  cgstPct: number;
  sgstPct: number;
  igstPct: number;
  defaultTdsPct: number;
  defaultBankPartyId: string;
  bankName: string;
  bankAccount: string;
  bankBranch: string;
  bankIfsc: string;
  smtpHost: string;
  smtpUser: string;
  smtpPass: string;
}

interface FirmFormProps {
  defaults: FirmFormValues;
  logoPath: string | null;
  sealPath: string | null;
  bankOptions: MasterOption[];
  stateOptions: MasterOption[];
  cityOptions: MasterOption[];
}

function UploadBlock({
  kind,
  label,
  currentPath,
}: {
  kind: "logo" | "seal";
  label: string;
  currentPath: string | null;
}) {
  const { toast } = useToast();
  const [path, setPath] = React.useState(currentPath);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const res = await fetch("/api/uploads/firm", { method: "POST", body: fd });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Upload failed");
      setPath(json.path);
      toast({ title: `${label} updated` });
    } catch (err) {
      toast({
        variant: "destructive",
        title: `${label} upload failed`,
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        {path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/uploads/${path}`}
            alt={label}
            className="h-16 w-16 rounded border object-contain"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded border text-xs text-muted-foreground">
            None
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          {busy ? "Uploading..." : `Upload ${label.toLowerCase()}`}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

export function FirmForm({
  defaults,
  logoPath,
  sealPath,
  bankOptions,
  stateOptions,
  cityOptions,
}: FirmFormProps) {
  const { toast } = useToast();
  const { register, handleSubmit, watch, setValue, formState } = useForm<FirmFormValues>({
    defaultValues: defaults,
  });

  const onSubmit = handleSubmit(async (values) => {
    const res = await saveFirmSettings({
      ...values,
      cgstPct: Number(values.cgstPct) || 0,
      sgstPct: Number(values.sgstPct) || 0,
      igstPct: Number(values.igstPct) || 0,
      defaultTdsPct: Number(values.defaultTdsPct) || 0,
    });
    if (res.ok) toast({ title: "Firm settings saved" });
    else toast({ variant: "destructive", title: "Save failed", description: res.error });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">Firm Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-2 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Firm Name *">
            <Input {...register("name", { required: true })} />
          </Field>
          <Field label="Alias">
            <Input {...register("alias")} />
          </Field>
          <Field label="Jurisdiction">
            <Input {...register("jurisdiction")} />
          </Field>
          <Field label="Address 1">
            <Input {...register("address1")} />
          </Field>
          <Field label="Address 2">
            <Input {...register("address2")} />
          </Field>
          <Field label="State">
            <MasterCombobox
              options={stateOptions}
              value={watch("stateId") || null}
              onChange={(v) => setValue("stateId", v ?? "")}
              placeholder="Select state..."
            />
          </Field>
          <Field label="City">
            <MasterCombobox
              options={cityOptions}
              value={watch("cityId") || null}
              onChange={(v) => setValue("cityId", v ?? "")}
              placeholder="Select city..."
            />
          </Field>
          <Field label="Phone">
            <Input {...register("phone")} />
          </Field>
          <Field label="Mobile">
            <Input {...register("mobile")} />
          </Field>
          <Field label="Email">
            <Input type="email" {...register("email")} />
          </Field>
          <Field label="Website">
            <Input {...register("website")} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">Statutory</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-2 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="GSTIN">
            <Input {...register("gstin")} />
          </Field>
          <Field label="PAN">
            <Input {...register("pan")} />
          </Field>
          <Field label="CIN">
            <Input {...register("cin")} />
          </Field>
          <Field label="MSME No">
            <Input {...register("msmeNo")} />
          </Field>
          <Field label="CGST % (default)">
            <Input type="number" step="0.01" {...register("cgstPct", { valueAsNumber: true })} />
          </Field>
          <Field label="SGST % (default)">
            <Input type="number" step="0.01" {...register("sgstPct", { valueAsNumber: true })} />
          </Field>
          <Field label="IGST % (default)">
            <Input type="number" step="0.01" {...register("igstPct", { valueAsNumber: true })} />
          </Field>
          <Field label="Default TDS %">
            <Input
              type="number"
              step="0.01"
              {...register("defaultTdsPct", { valueAsNumber: true })}
            />
          </Field>
          <Field label="Default Bank">
            <MasterCombobox
              options={bankOptions}
              value={watch("defaultBankPartyId") || null}
              onChange={(v) => setValue("defaultBankPartyId", v ?? "")}
              placeholder="Select bank..."
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">Bank Details (printed on bills)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-2 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Bank Name">
            <Input {...register("bankName")} />
          </Field>
          <Field label="Account No">
            <Input {...register("bankAccount")} />
          </Field>
          <Field label="Branch">
            <Input {...register("bankBranch")} />
          </Field>
          <Field label="IFSC">
            <Input {...register("bankIfsc")} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">Email (SMTP)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-2 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="SMTP Host">
            <Input {...register("smtpHost")} />
          </Field>
          <Field label="SMTP User">
            <Input {...register("smtpUser")} />
          </Field>
          <Field label="SMTP Password">
            <Input type="password" {...register("smtpPass")} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">Logo &amp; Seal</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 p-4 pt-2 sm:grid-cols-2">
          <UploadBlock kind="logo" label="Logo" currentPath={logoPath} />
          <UploadBlock kind="seal" label="Seal" currentPath={sealPath} />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </form>
  );
}

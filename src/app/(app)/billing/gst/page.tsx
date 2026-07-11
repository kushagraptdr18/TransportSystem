import { InvoiceEntryPage } from "../entry-page";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: { id?: string } }) {
  return <InvoiceEntryPage kind="GST" searchParams={searchParams} />;
}

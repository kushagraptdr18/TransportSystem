import { LrTypeReportPage } from "../lr-type/report-page";

export const dynamic = "force-dynamic";

export default function Page({
  searchParams,
}: {
  searchParams: { date_from?: string; date_to?: string; q?: string };
}) {
  return (
    <LrTypeReportPage
      lrType="CANCELLED"
      title="Cancelled LR Report"
      fileName="cancelled-lrs"
      searchParams={searchParams}
    />
  );
}

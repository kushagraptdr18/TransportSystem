import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BillSubmissionForm } from "@/components/billing/submission-form";

export const dynamic = "force-dynamic";

export default async function BillSubmissionPage() {
  const session = requireSession();

  const { parties, recent } = await withTenant(session.tenantId, async (tx) => {
    const [partyRows, recentRows] = await Promise.all([
      tx.party.findMany({
        where: { isActive: true, ledgerGroup: "CONSIGNEE_CONSIGNOR" },
        orderBy: { name: "asc" },
      }),
      tx.billSubmission.findMany({
        where: { firmId: session.firmId, fyId: session.fyId },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
    ]);
    return { parties: partyRows, recent: recentRows };
  });

  const partyById = new Map(parties.map((p) => [p.id, p.name]));

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">Bill Submission</h1>
      <BillSubmissionForm
        partyOptions={parties.map((p) => ({ value: p.id, label: p.name }))}
      />
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Submissions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bill No</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Party</TableHead>
                <TableHead>Received By</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Submitted By</TableHead>
                <TableHead>Docket No</TableHead>
                <TableHead>Remarks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No submissions recorded yet.
                  </TableCell>
                </TableRow>
              )}
              {recent.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.billNo}</TableCell>
                  <TableCell>{formatDate(s.billDate)}</TableCell>
                  <TableCell>{(s.partyId && partyById.get(s.partyId)) || ""}</TableCell>
                  <TableCell>{s.receivedBy}</TableCell>
                  <TableCell>{s.deptName}</TableCell>
                  <TableCell>{s.submittedBy}</TableCell>
                  <TableCell>{s.docketNo}</TableCell>
                  <TableCell>{s.remarks}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

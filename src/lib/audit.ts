import { Tx } from "./db";
import { Session } from "./session";

export async function audit(
  tx: Tx,
  session: Session,
  args: {
    entity: string;
    entityId: string;
    action: "CREATE" | "UPDATE" | "DELETE" | "PRINT" | "LOGIN";
    before?: unknown;
    after?: unknown;
  }
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: session.tenantId,
      firmId: session.firmId ?? null,
      userId: session.userId,
      entity: args.entity,
      entityId: args.entityId,
      action: args.action,
      before: args.before === undefined ? undefined : JSON.parse(JSON.stringify(args.before)),
      after: args.after === undefined ? undefined : JSON.parse(JSON.stringify(args.after)),
    },
  });
}

import "server-only";
import type { PoolClient } from "pg";
import type { Scope } from "./security/service";
export async function audit(
  db: PoolClient,
  scope: Scope,
  action: string,
  entityId: string,
  reason: string,
  before: unknown,
  after: unknown,
) {
  await db.query(
    'insert into gym.audit_events(organization_id,actor_user_id,action,entity_id,request_id,reason,"before","after") values($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)',
    [
      scope.organizationId,
      scope.userId,
      action,
      entityId,
      scope.requestId,
      reason,
      JSON.stringify(before),
      JSON.stringify(after),
    ],
  );
}

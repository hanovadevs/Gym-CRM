import "server-only";
import type { PoolClient } from "pg";
export type AccountMailTarget = {
  auth_user_id: string;
  recipient_email: string | null;
  organization_id: string | null;
  gym_name: string | null;
  login_email: string;
  is_gym_account: boolean;
};
export async function accountMailTarget(
  db: Pick<PoolClient, "query">,
  userId: string,
): Promise<AccountMailTarget | null> {
  return (
    (
      await db.query<AccountMailTarget>(
        "select * from gym.account_mail_target($1)",
        [userId],
      )
    ).rows[0] ?? null
  );
}

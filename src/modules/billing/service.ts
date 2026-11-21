import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { createSecurity, Scope } from "@/server/security/service";
import { can } from "@/server/security/permissions";
import { parse } from "@/modules/members/service";
import { BusinessError } from "@/server/errors";
import { audit } from "@/server/audit";
import { todayInZone } from "@/modules/plans/format";
import {
  createInvoice,
  changeInvoice,
  invoiceQuery,
  detailQuery,
  recipientsQuery,
  type DraftValues,
} from "./schemas";
import { invoiceTotals } from "./calculations";
import type { Invoice, InvoiceDetail, InvoiceList } from "./types";
export async function invoiceNumber(
  db: PoolClient,
  organizationId: string,
  prefix: string,
) {
  const n = (
    await db.query(
      "insert into gym.number_counters(organization_id,kind,value) values($1,'invoice',1) on conflict(organization_id,kind) do update set value=gym.number_counters.value+1 returning value::text",
      [organizationId],
    )
  ).rows[0].value;
  return prefix + "-INV-" + n.padStart(6, "0");
}
const fields = `i.id,i.member_id as "memberId",i.membership_id as "membershipId",i.originating_branch_id as "branchId",i.branch_name as "branchName",i.number,i.description,i.total_minor::text as "totalMinor",b.balance_minor::text as "balanceMinor",i.currency,i.issued_on::text as "issuedOn",i.due_on::text as "dueOn",i.status,i.version,i.line_revision as "lineRevision",i.recipient_name as "recipientName",i.recipient_code as "recipientCode",to_jsonb(i.created_at)#>>'{}' as "createdAt"`;
const joined =
  "gym.invoices i join gym.invoice_balances b on b.organization_id=i.organization_id and b.invoice_id=i.id";
const scoped =
  "i.organization_id=$1 and i.originating_branch_id=any($2::uuid[])";
async function org(db: PoolClient, s: Scope) {
  return (
    await db.query(
      `select id,name,currency,locale,time_zone as "timeZone",receipt_prefix as "receiptPrefix" from gym.organizations where id=$1 for share`,
      [s.organizationId],
    )
  ).rows[0];
}
async function header(
  db: PoolClient,
  s: Scope,
  id: string,
  lock = false,
): Promise<Invoice> {
  const r = (
    await db.query(
      `select ${fields} from ${joined} where ${scoped} and i.id=$3${lock ? " for update of i" : ""}`,
      [s.organizationId, [...s.branchIds], id],
    )
  ).rows[0];
  if (!r) throw new BusinessError("NOT_FOUND", "Invoice not found.");
  return r;
}
async function details(
  db: PoolClient,
  s: Scope,
  id: string,
): Promise<InvoiceDetail> {
  // Lock the header across line/snapshot reads so a draft cannot mix revisions.
  const i = await header(db, s, id, true);
  const items = (
    await db.query(
      `select position,description,quantity,unit_minor::float8 as "unitMinor",discount_minor::float8 as "discountMinor",total_minor::float8 as "totalMinor" from gym.invoice_items where organization_id=$1 and invoice_id=$2 and revision=$3 order by position`,
      [s.organizationId, id, i.lineRevision],
    )
  ).rows;
  const issuer = (
    await db.query(
      "select issuer_snapshot from gym.invoices where organization_id=$1 and id=$2",
      [s.organizationId, id],
    )
  ).rows[0].issuer_snapshot;
  const totals = invoiceTotals(items);
  const membershipTerm = i.membershipId
    ? (
        await db.query(
          'select start_on::text as "startOn",original_end_on_exclusive::text as "endOn" from gym.memberships where organization_id=$1 and id=$2',
          [s.organizationId, i.membershipId],
        )
      ).rows[0]
    : null;
  return {
    invoice: i,
    items,
    issuer,
    membershipTerm,
    organization: await org(db, s),
    subtotalMinor: totals.subtotalMinor,
    discountMinor: totals.discountMinor,
    canManageSettings: can(s.role, "settings.read"),
    canManageMembers: can(s.role, "members.manage"),
    requestId: s.requestId,
  };
}
async function validateMember(
  db: PoolClient,
  s: Scope,
  id: string,
  branch?: string,
) {
  const m = (
    await db.query(
      `select id,home_branch_id,archived_at from gym.members where organization_id=$1 and id=$2 and home_branch_id=any($3::uuid[]) for update`,
      [s.organizationId, id, [...s.branchIds]],
    )
  ).rows[0];
  if (!m) throw new BusinessError("NOT_FOUND", "Billing recipient not found.");
  if (m.archived_at)
    throw new BusinessError(
      "CONFLICT",
      "Restore this member before creating or issuing a charge.",
    );
  if (branch && branch !== m.home_branch_id)
    throw new BusinessError(
      "CONFLICT",
      "The member changed home branch. Create a new draft in the correct branch.",
    );
  return m;
}
function totals(values: DraftValues) {
  try {
    return invoiceTotals(values.lines);
  } catch (e) {
    throw new BusinessError(
      "VALIDATION_ERROR",
      e instanceof Error ? e.message : "Invalid invoice lines.",
    );
  }
}
async function insertLines(
  db: PoolClient,
  s: Scope,
  id: string,
  revision: number,
  items: ReturnType<typeof invoiceTotals>["items"],
) {
  for (const line of items)
    await db.query(
      `insert into gym.invoice_items(organization_id,invoice_id,revision,position,description,quantity,unit_minor,discount_minor,total_minor) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        s.organizationId,
        id,
        revision,
        line.position,
        line.description,
        line.quantity,
        line.unitMinor,
        line.discountMinor,
        line.totalMinor,
      ],
    );
}
export function createBillingService(
  security: ReturnType<typeof createSecurity>,
) {
  async function list(headers: Headers, raw: unknown): Promise<InvoiceList> {
    const q = parse(invoiceQuery, raw);
    return security.run(
      headers,
      { organizationId: q.organizationId, branchId: q.branchId },
      "billing.read",
      async (db, s) => {
        const organization = await org(db, s),
          today = todayInZone(organization.timeZone);
        const branches = (
          await db.query(
            "select id,name from gym.branches where organization_id=$1 and id=any($2::uuid[]) order by name,id",
            [s.organizationId, [...s.authorizedBranchIds]],
          )
        ).rows;
        const order = {
          newest: "created_at desc,id desc",
          due: '"dueOn",id',
          amount: '"totalMinor"::bigint desc,id',
        }[q.sort];
        // Rows, totals, page bounds and currency-separated summaries share one snapshot.
        const r = (
          await db.query(
            `with filtered as(select ${fields},i.created_at,b.balance_minor from ${joined} where ${scoped} and (i.number ilike $3 or i.description ilike $3 or i.recipient_name ilike $3 or i.recipient_code ilike $3) and ($4::uuid is null or i.member_id=$4) and ($5::date is null or coalesce(i.issued_on,i.created_at at time zone $9)::date >=$5) and ($6::date is null or coalesce(i.issued_on,i.created_at at time zone $9)::date <=$6)), selected as(select * from filtered where $7='all' or ($7='draft' and status='draft') or ($7='issued' and status='issued') or ($7='outstanding' and balance_minor>0) or ($7='overdue' and balance_minor>0 and "dueOn"<$8)), tally as(select count(*)::int total from selected), bounds as(select total,greatest(1,least($10::int,(total+24)/25)) page from tally) select total,page,coalesce((select jsonb_agg(to_jsonb(r)-'created_at'-'balance_minor') from(select * from selected order by ${order} limit 25 offset(select(page-1)*25 from bounds))r),'[]'::jsonb) invoices,jsonb_build_object('outstandingCount',(select count(*)::int from filtered where balance_minor>0),'overdueCount',(select count(*)::int from filtered where balance_minor>0 and "dueOn"<$8),'draftCount',(select count(*)::int from filtered where status='draft'),'currencies',coalesce((select jsonb_agg(c) from(select currency,sum(balance_minor)::text as "outstandingMinor",coalesce(sum(balance_minor) filter(where "dueOn"<$8),0)::text as "overdueMinor" from filtered where status='issued' group by currency order by currency)c),'[]'::jsonb)) summary from bounds`,
            [
              s.organizationId,
              [...s.branchIds],
              "%" + q.q.replace(/[\\%_]/g, "\\$&") + "%",
              q.memberId ?? null,
              q.from ?? null,
              q.to ?? null,
              q.status,
              today,
              organization.timeZone,
              q.page,
            ],
          )
        ).rows[0];
        return {
          organization,
          branches,
          ...r,
          pageSize: 25,
          today,
          query: { ...q, organizationId: s.organizationId, page: r.page },
          canManageSettings: can(s.role, "settings.read"),
          canManageMembers: can(s.role, "members.manage"),
          requestId: s.requestId,
        };
      },
    );
  }
  async function get(headers: Headers, id: string, raw: unknown) {
    parse(z.uuid(), id);
    const q = parse(detailQuery, raw);
    return security.run(headers, q, "billing.read", (db, s) =>
      details(db, s, id),
    );
  }
  async function recipients(headers: Headers, raw: unknown) {
    const q = parse(recipientsQuery, raw);
    return security.run(
      headers,
      { organizationId: q.organizationId, branchId: q.branchId },
      "billing.invoice",
      async (db, s) => {
        const rows = (
          await db.query(
            `with matches as(select m.id,m.name,m.member_code as "memberCode",m.home_branch_id as "branchId",b.name as "branchName" from gym.members m join gym.branches b on b.organization_id=m.organization_id and b.id=m.home_branch_id where m.organization_id=$1 and m.home_branch_id=any($2::uuid[]) and m.archived_at is null and (m.name ilike $3 or m.member_code ilike $3)) select (select count(*)::int from matches) total,coalesce((select jsonb_agg(r) from(select * from matches order by name,id limit 25)r),'[]'::jsonb) recipients`,
            [
              s.organizationId,
              [...s.branchIds],
              "%" + q.q.replace(/[\\%_]/g, "\\$&") + "%",
            ],
          )
        ).rows[0];
        return { ...rows, requestId: s.requestId };
      },
    );
  }
  async function write(headers: Headers, raw: unknown, id?: string) {
    if (id) parse(z.uuid(), id);
    const input = id ? parse(changeInvoice, raw) : parse(createInvoice, raw),
      operation = "operation" in input ? input.operation : "create";
    return security.run(
      headers,
      { organizationId: input.organizationId },
      "billing.invoice",
      async (db, s) => {
        await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          "billing-request:" +
            s.organizationId +
            ":" +
            s.userId +
            ":" +
            input.requestKey,
        ]);
        const hash = createHash("sha256")
          .update(JSON.stringify({ id: id ?? null, ...input }))
          .digest("hex");
        const old = (
          await db.query(
            "select request_hash,result,invoice_id from gym.billing_requests where organization_id=$1 and actor_id=$2 and request_key=$3",
            [s.organizationId, s.userId, input.requestKey],
          )
        ).rows[0];
        if (old) {
          if (old.request_hash !== hash)
            throw new BusinessError(
              "CONFLICT",
              "This request key was used for different invoice details.",
            );
          await header(db, s, old.invoice_id);
          return { ...old.result, requestId: s.requestId };
        }
        const before = id ? await header(db, s, id) : null;
        const member = await validateMember(
          db,
          s,
          before?.memberId ?? ("memberId" in input ? input.memberId : ""),
          before?.branchId,
        );
        const current = id ? await header(db, s, id, true) : null;
        const organization = await org(db, s),
          today = todayInZone(organization.timeZone);
        if (
          current &&
          (current.status !== "draft" ||
            !("version" in input) ||
            input.version !== current.version)
        )
          throw new BusinessError(
            "CONFLICT",
            "This invoice changed or was issued. Reload latest before making changes.",
          );
        if (
          (current?.currency ??
            ("values" in input ? input.values.currency : "")) !==
          organization.currency
        )
          throw new BusinessError(
            "CONFLICT",
            "The gym currency changed. Use a new draft in the current currency.",
          );
        let invoiceId = id!,
          version = 1;
        if (operation === "create" && "values" in input) {
          const t = totals(input.values);
          invoiceId = (
            await db.query(
              `insert into gym.invoices(organization_id,member_id,originating_branch_id,description,total_minor,currency,due_on,status,created_by) values($1,$2,$3,$4,$5,$6,$7,'draft',$8) returning id`,
              [
                s.organizationId,
                member.id,
                member.home_branch_id,
                input.values.description,
                t.totalMinor,
                input.values.currency,
                input.values.dueOn,
                s.userId,
              ],
            )
          ).rows[0].id;
          await insertLines(db, s, invoiceId, 1, t.items);
        } else if (operation === "edit" && current && "values" in input) {
          if (input.values.currency !== current.currency)
            throw new BusinessError(
              "VALIDATION_ERROR",
              "Invoice currency cannot be changed.",
            );
          const t = totals(input.values);
          version = current.version + 1;
          await db.query(
            "update gym.invoices set description=$3,total_minor=$4,due_on=$5,version=version+1,line_revision=line_revision+1 where organization_id=$1 and id=$2",
            [
              s.organizationId,
              invoiceId,
              input.values.description,
              t.totalMinor,
              input.values.dueOn,
            ],
          );
          await insertLines(
            db,
            s,
            invoiceId,
            current.lineRevision + 1,
            t.items,
          );
        } else if (operation === "issue" && current) {
          if (current.dueOn < today)
            throw new BusinessError(
              "VALIDATION_ERROR",
              "Update the draft due date to today or later before issuing.",
            );
          const number = await invoiceNumber(
            db,
            s.organizationId,
            organization.receiptPrefix,
          );
          version = current.version + 1;
          await db.query(
            "update gym.invoices set status='issued',number=$3,issued_on=$4,version=version+1 where organization_id=$1 and id=$2",
            [s.organizationId, invoiceId, number, today],
          );
        } else
          throw new BusinessError(
            "VALIDATION_ERROR",
            "Invalid invoice operation.",
          );
        const result = { invoiceId, version };
        await audit(
          db,
          s,
          "invoice." + operation,
          invoiceId,
          input.reason,
          current ? { version: current.version, status: current.status } : null,
          { version, operation },
        );
        await db.query(
          "insert into gym.billing_requests(organization_id,actor_id,invoice_id,operation,request_key,request_hash,result) values($1,$2,$3,$4,$5,$6,$7::jsonb)",
          [
            s.organizationId,
            s.userId,
            invoiceId,
            operation,
            input.requestKey,
            hash,
            JSON.stringify(result),
          ],
        );
        return { ...result, requestId: s.requestId };
      },
    );
  }
  async function download(headers: Headers, id: string, raw: unknown) {
    parse(z.uuid(), id);
    const q = parse(detailQuery, raw);
    return security.run(headers, q, "billing.read", async (db, s) => {
      const result = await details(db, s, id);
      if (result.invoice.status !== "issued")
        throw new BusinessError(
          "CONFLICT",
          "Issue this invoice before downloading its PDF.",
        );
      await audit(
        db,
        s,
        "invoice.pdf_requested",
        id,
        "Invoice PDF requested",
        null,
        { version: result.invoice.version },
      );
      return result;
    });
  }
  return {
    list,
    get,
    recipients,
    download,
    create: (h: Headers, r: unknown) => write(h, r),
    change: (h: Headers, id: string, r: unknown) => write(h, r, id),
  };
}

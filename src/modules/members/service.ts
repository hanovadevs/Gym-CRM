import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { createSecurity, Scope } from "@/server/security/service";
import { can } from "@/server/security/permissions";
import { audit } from "@/server/audit";
import { BusinessError } from "@/server/errors";
import {
  createMember,
  updateMember,
  listMembers,
  normalizePhone,
  localToday,
  memberFields,
} from "./schemas";
import type { MemberValues } from "./schemas";
import type { Member, Directory, DuplicateMatch } from "./types";
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BusinessError(
      "VALIDATION_ERROR",
      result.error.issues
        .slice(0, 4)
        .map((i) => (i.path.length ? i.path.join(".") + ": " : "") + i.message)
        .join("; "),
    );
  return result.data;
}
const fields = `m.id,m.member_code as "memberCode",m.name,m.phone,m.email,m.home_branch_id as "homeBranchId",b.name as "branchName",m.joined_on::text as "joinedOn",m.version`;
const join =
  "gym.members m join gym.branches b on b.organization_id=m.organization_id and b.id=m.home_branch_id";
async function readMember(
  db: PoolClient,
  scope: Scope,
  id: string,
  lock = false,
): Promise<Member> {
  const row = (
    await db.query<Member>(
      `select ${fields} from ${join} where m.organization_id=$1 and m.id=$2 and m.home_branch_id=any($3::uuid[]) and m.archived_at is null ${lock ? "for update of m" : ""}`,
      [scope.organizationId, id, [...scope.branchIds]],
    )
  ).rows[0];
  if (!row) throw new BusinessError("NOT_FOUND", "Member not found.");
  return row;
}
async function checkDate(db: PoolClient, scope: Scope, joinedOn: string) {
  const org = (
    await db.query("select time_zone from gym.organizations where id=$1", [
      scope.organizationId,
    ])
  ).rows[0];
  if (joinedOn > localToday(org.time_zone))
    throw new BusinessError(
      "VALIDATION_ERROR",
      "Joining date cannot be after today in the gym's time zone.",
    );
}
async function checkDuplicate(
  db: PoolClient,
  scope: Scope,
  values: MemberValues,
  acknowledged: boolean,
  exclude?: string,
) {
  const phone = normalizePhone(values.phone);
  // Deterministic contact locks make simultaneous registrations see the first committed match.
  for (const key of [
    phone ? "phone:" + phone : "",
    values.email ? "email:" + values.email : "",
  ]
    .filter(Boolean)
    .sort())
    await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      "member-contact:" + scope.organizationId + ":" + key,
    ]);
  const matches = (
    await db.query<DuplicateMatch>(
      `select m.id,m.member_code as "memberCode",m.name,b.name as "branchName" from ${join} where m.organization_id=$1 and m.home_branch_id=any($2::uuid[]) and ($3::uuid is null or m.id<>$3) and (($4<>'' and m.normalized_phone=$4) or ($5<>'' and m.email=$5)) order by m.name,m.id limit 6`,
      [
        scope.organizationId,
        [...scope.authorizedBranchIds],
        exclude ?? null,
        phone,
        values.email,
      ],
    )
  ).rows;
  if (matches.length && !acknowledged)
    throw new BusinessError(
      "CONFLICT",
      "Possible shared contact. Review these members, then confirm if this is a different person.",
      { duplicates: matches.slice(0, 5), moreMatches: matches.length > 5 },
    );
  return matches.length > 0;
}
export function createMembersService(
  security: ReturnType<typeof createSecurity>,
) {
  async function list(headers: Headers, raw: unknown): Promise<Directory> {
    const query = parse(listMembers, raw);
    return security.run(
      headers,
      { organizationId: query.organizationId, branchId: query.branchId },
      "members.manage",
      async (db, scope) => {
        const org = (
          await db.query(
            'select id,name,locale,time_zone as "timeZone" from gym.organizations where id=$1',
            [scope.organizationId],
          )
        ).rows[0];
        const branches = (
          await db.query(
            "select id,name from gym.branches where id=any($1::uuid[]) order by name,id",
            [[...scope.authorizedBranchIds]],
          )
        ).rows;
        const escaped = query.q.replace(/[\\%_]/g, "\\$&");
        const phone = /^[+0-9() .-]+$/.test(query.q)
          ? normalizePhone(query.q)
          : "";
        const where = `m.organization_id=$1 and m.home_branch_id=any($2::uuid[]) and m.archived_at is null and ($3='%%' or m.name ilike $3 or m.member_code ilike $3 or m.email ilike $3 or ($4<>'' and m.normalized_phone like '%'||$4||'%'))`;
        const order = {
          name: "m.name,m.id",
          newest: "m.joined_on desc,m.member_code desc,m.id",
          oldest: "m.joined_on,m.member_code,m.id",
          code: "m.member_code,m.id",
        }[query.sort];
        // Count, page clamping and rows share one PostgreSQL statement snapshot.
        const result = (
          await db.query(
            `with tally as (select count(*)::int as total from gym.members m where ${where}), bounds as (select total,greatest(1,least($5::int,(total+24)/25)) as page from tally) select total,page,coalesce((select jsonb_agg(p) from (select ${fields} from ${join} where ${where} order by ${order} limit 25 offset (select (page-1)*25 from bounds)) p),'[]'::jsonb) as members from bounds`,
            [
              scope.organizationId,
              [...scope.branchIds],
              "%" + escaped + "%",
              phone,
              query.page,
            ],
          )
        ).rows[0];
        return {
          organization: org,
          branches,
          members: result.members,
          total: result.total,
          page: result.page,
          pageSize: 25,
          today: localToday(org.timeZone),
          canManageSettings: can(scope.role, "settings.read"),
          query: {
            ...query,
            organizationId: scope.organizationId,
            page: result.page,
          },
          requestId: scope.requestId,
        };
      },
    );
  }
  async function create(headers: Headers, raw: unknown) {
    const input = parse(createMember, raw);
    return security.run(
      headers,
      { organizationId: input.organizationId },
      "members.manage",
      async (db, scope) => {
        if (!scope.branchIds.includes(input.homeBranchId))
          throw new BusinessError("NOT_FOUND", "Branch not found.");
        const values = memberFields.parse({
          name: input.name,
          phone: input.phone,
          email: input.email,
          homeBranchId: input.homeBranchId,
          joinedOn: input.joinedOn,
        });
        const hash = createHash("sha256")
          .update(JSON.stringify(values))
          .digest("hex");
        await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          "registration:" +
            scope.organizationId +
            ":" +
            scope.userId +
            ":" +
            input.registrationKey,
        ]);
        const existing = (
          await db.query(
            "select id,registration_hash from gym.members where organization_id=$1 and created_by=$2 and registration_key=$3",
            [scope.organizationId, scope.userId, input.registrationKey],
          )
        ).rows[0];
        if (existing) {
          if (existing.registration_hash !== hash)
            throw new BusinessError(
              "CONFLICT",
              "This registration was already saved with different details. Close the form and reload the directory before editing.",
            );
          return {
            member: await readMember(db, scope, existing.id),
            replayed: true,
            requestId: scope.requestId,
          };
        }
        await checkDate(db, scope, input.joinedOn);
        const shared = await checkDuplicate(
          db,
          scope,
          values,
          input.acknowledgeDuplicate,
        );
        const count = (
          await db.query(
            "insert into gym.number_counters(organization_id,kind,value) values($1,'member',1) on conflict(organization_id,kind) do update set value=gym.number_counters.value+1 returning value::text",
            [scope.organizationId],
          )
        ).rows[0].value;
        const code = "M-" + count.padStart(6, "0");
        const id = (
          await db.query(
            "insert into gym.members(organization_id,home_branch_id,member_code,name,phone,normalized_phone,email,joined_on,registration_key,registration_hash,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) returning id",
            [
              scope.organizationId,
              input.homeBranchId,
              code,
              input.name,
              input.phone,
              normalizePhone(input.phone),
              input.email,
              input.joinedOn,
              input.registrationKey,
              hash,
              scope.userId,
            ],
          )
        ).rows[0].id;
        await audit(
          db,
          scope,
          "member.registered",
          id,
          shared ? input.duplicateReason : "Member registration",
          null,
          {
            memberCode: code,
            homeBranchId: input.homeBranchId,
            version: 1,
            sharedContactConfirmed: shared,
          },
        );
        return {
          member: await readMember(db, scope, id),
          replayed: false,
          requestId: scope.requestId,
        };
      },
    );
  }
  async function update(headers: Headers, raw: unknown) {
    const input = parse(updateMember, raw);
    return security.run(
      headers,
      { organizationId: input.organizationId },
      "members.manage",
      async (db, scope) => {
        if (!scope.branchIds.includes(input.homeBranchId))
          throw new BusinessError("NOT_FOUND", "Branch not found.");
        const current = await readMember(db, scope, input.id, true);
        if (current.version !== input.version)
          throw new BusinessError(
            "CONFLICT",
            "This member changed since you opened the form. Your inputs are kept. Close and reload the directory before editing again.",
          );
        await checkDate(db, scope, input.joinedOn);
        const changedContact = {
          ...input,
          phone:
            normalizePhone(current.phone) !== normalizePhone(input.phone)
              ? input.phone
              : "",
          email: current.email !== input.email ? input.email : "",
        };
        const shared =
          changedContact.phone || changedContact.email
            ? await checkDuplicate(
                db,
                scope,
                changedContact,
                input.acknowledgeDuplicate,
                input.id,
              )
            : false;
        const changedFields = (
          Object.keys(memberFields.shape) as (keyof MemberValues)[]
        ).filter((key) => current[key] !== input[key]);
        await db.query(
          "update gym.members set name=$1,phone=$2,normalized_phone=$3,email=$4,home_branch_id=$5,joined_on=$6,updated_by=$7,updated_at=now(),version=version+1 where id=$8 and organization_id=$9",
          [
            input.name,
            input.phone,
            normalizePhone(input.phone),
            input.email,
            input.homeBranchId,
            input.joinedOn,
            scope.userId,
            input.id,
            scope.organizationId,
          ],
        );
        await audit(
          db,
          scope,
          "member.updated",
          input.id,
          input.reason,
          { version: input.version },
          {
            version: input.version + 1,
            changedFields,
            sharedContactConfirmed: shared,
            ...(shared ? { sharedContactReason: input.duplicateReason } : {}),
          },
        );
        return {
          member: await readMember(db, scope, input.id),
          requestId: scope.requestId,
        };
      },
    );
  }
  return { list, create, update };
}

import "server-only";
import { z } from "zod";
import type { createSecurity } from "@/server/security/service";
import { can } from "@/server/security/permissions";
import { BusinessError } from "@/server/errors";
import { audit } from "@/server/audit";
import { parse, readMember } from "./service";
import { localToday } from "./schemas";
import {
  profileQuery,
  saveEmergency,
  archiveMember,
  addNote,
  withdrawNote,
} from "./profile-schemas";
import type { Profile } from "./profile-types";
import { readMembershipContext } from "@/modules/memberships/service";
import { readPaymentPage } from "@/modules/payments/service";
import { memberVisits } from "@/modules/attendance/service";
import { memberAccess } from "@/modules/attendance/access";
export function createProfileService(
  security: ReturnType<typeof createSecurity>,
) {
  async function get(
    headers: Headers,
    id: string,
    raw: unknown,
  ): Promise<Profile> {
    const query = parse(profileQuery, raw);
    parse(z.uuid(), id);
    return security.run(
      headers,
      { organizationId: query.organizationId, branchId: query.branchId },
      "members.manage",
      async (db, scope) => {
        const member = await readMember(db, scope, id, "share", true),
          management = ["owner", "manager"].includes(scope.role);
        const organization = (
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
        const contact =
          (
            await db.query(
              "select name,phone,relationship from gym.member_contacts where organization_id=$1 and member_id=$2",
              [scope.organizationId, id],
            )
          ).rows[0] ?? null;
        const noteWhere =
          "n.organization_id=$1 and n.member_id=$2 and ($3 or n.visibility='operational')";
        const notes = (
          await db.query(
            `with tally as(select count(*)::int as total from gym.member_notes n where ${noteWhere}), bounds as(select total,greatest(1,least($4::int,(total+19)/20)) as page from tally) select total,page,coalesce((select jsonb_agg(p) from (select n.id,case when w.note_id is null then n.body else null end as body,n.visibility,u.name as "authorName",to_jsonb(n.created_at)#>>'{}' as "createdAt",w.note_id is not null as withdrawn,w.reason as "withdrawalReason",(w.note_id is null and $5::boolean and ($3 or n.author_user_id=$6)) as "canWithdraw" from gym.member_notes n join app_auth."user" u on u.id=n.author_user_id left join gym.member_note_withdrawals w on w.organization_id=n.organization_id and w.note_id=n.id where ${noteWhere} order by n.created_at desc,n.id desc limit 20 offset (select(page-1)*20 from bounds)) p),'[]') as notes from bounds`,
            [
              scope.organizationId,
              id,
              management,
              query.notesPage,
              !member.archivedAt,
              scope.userId,
            ],
          )
        ).rows[0];
        const history = (
          await db.query(
            `select e.id,e.action,e.reason,u.name as "actorName",to_jsonb(e.occurred_at)#>>'{}' as "occurredAt" from gym.audit_events e join app_auth."user" u on u.id=e.actor_user_id where e.organization_id=$1 and e.entity_id=$2 and e.action in ('member.registered','member.updated','member.emergency_contact_updated','member.archived','member.restored') and ($3 or e.actor_user_id=$4) order by e.occurred_at desc,e.id desc limit 20`,
            [scope.organizationId, id, management, scope.userId],
          )
        ).rows;
        const memberships = await readMembershipContext(db, scope, member);
        const admission = await memberAccess(
          db,
          scope,
          {
            id: member.id,
            name: member.name,
            memberCode: member.memberCode,
            homeBranchId: member.homeBranchId,
            archived: !!member.archivedAt,
            phoneEnding: member.phone.replace(/\D/g, "").slice(-4),
          },
          member.homeBranchId,
        );
        return {
          visits: await memberVisits(db, scope, id),
          organization,
          payments: await readPaymentPage(db, scope, {
            organizationId: scope.organizationId,
            memberId: id,
            q: "",
            method: "all",
            page: 1,
          }),
          branches,
          today: localToday(organization.timeZone),
          canManageSettings: can(scope.role, "settings.read"),
          member,
          contact,
          notes: notes.notes,
          notesPage: notes.page,
          notesTotal: notes.total,
          canManage: management,
          history,
          eligibility: admission.access,
          memberships,
          requestId: scope.requestId,
        };
      },
    );
  }
  async function contact(headers: Headers, raw: unknown) {
    const input = parse(saveEmergency, raw);
    return security.run(
      headers,
      { organizationId: input.organizationId },
      "members.manage",
      async (db, scope) => {
        const member = await readMember(db, scope, input.id, true);
        if (member.version !== input.version)
          throw new BusinessError(
            "CONFLICT",
            "This profile changed. Your inputs are kept; reload before saving.",
          );
        if (input.contact)
          await db.query(
            "insert into gym.member_contacts(organization_id,member_id,name,phone,relationship) values($1,$2,$3,$4,$5) on conflict(organization_id,member_id) do update set name=excluded.name,phone=excluded.phone,relationship=excluded.relationship",
            [
              scope.organizationId,
              input.id,
              input.contact.name,
              input.contact.phone,
              input.contact.relationship,
            ],
          );
        else
          await db.query(
            "delete from gym.member_contacts where organization_id=$1 and member_id=$2",
            [scope.organizationId, input.id],
          );
        await db.query(
          "update gym.members set version=version+1,updated_by=$1,updated_at=now() where id=$2",
          [scope.userId, input.id],
        );
        await audit(
          db,
          scope,
          "member.emergency_contact_updated",
          input.id,
          input.reason,
          { version: input.version },
          { version: input.version + 1, present: Boolean(input.contact) },
        );
        return { requestId: scope.requestId };
      },
    );
  }
  async function archive(headers: Headers, raw: unknown) {
    const input = parse(archiveMember, raw);
    return security.run(
      headers,
      { organizationId: input.organizationId },
      "members.manage",
      async (db, scope) => {
        if (!["owner", "manager"].includes(scope.role))
          throw new BusinessError(
            "FORBIDDEN",
            "Only an owner or manager may archive or restore a member.",
          );
        const member = await readMember(db, scope, input.id, true, true);
        if (member.version !== input.version)
          throw new BusinessError(
            "CONFLICT",
            "This profile changed. Reload before archiving or restoring.",
          );
        if (Boolean(member.archivedAt) === input.archived)
          return { requestId: scope.requestId };
        await db.query(
          "update gym.members set archived_at=case when $1 then now() else null end,version=version+1,updated_by=$2,updated_at=now() where id=$3",
          [input.archived, scope.userId, input.id],
        );
        await audit(
          db,
          scope,
          input.archived ? "member.archived" : "member.restored",
          input.id,
          input.reason,
          { version: input.version, archived: Boolean(member.archivedAt) },
          { version: input.version + 1, archived: input.archived },
        );
        return { requestId: scope.requestId };
      },
    );
  }
  async function note(headers: Headers, raw: unknown) {
    const input = parse(addNote, raw);
    return security.run(
      headers,
      { organizationId: input.organizationId },
      "members.manage",
      async (db, scope) => {
        await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          "member-note:" +
            scope.organizationId +
            ":" +
            scope.userId +
            ":" +
            input.requestKey,
        ]);
        await readMember(db, scope, input.id, true);
        if (
          input.visibility === "management" &&
          !["owner", "manager"].includes(scope.role)
        )
          throw new BusinessError(
            "FORBIDDEN",
            "Management notes require an owner or manager.",
          );
        const existing = (
          await db.query(
            "select id,member_id,body,visibility from gym.member_notes where organization_id=$1 and author_user_id=$2 and request_key=$3",
            [scope.organizationId, scope.userId, input.requestKey],
          )
        ).rows[0];
        if (existing) {
          if (
            existing.member_id !== input.id ||
            existing.body !== input.body ||
            existing.visibility !== input.visibility
          )
            throw new BusinessError(
              "CONFLICT",
              "This note request was already saved with different details.",
            );
          return { id: existing.id, requestId: scope.requestId };
        }
        const id = (
          await db.query(
            "insert into gym.member_notes(organization_id,member_id,author_user_id,visibility,body,request_key) values($1,$2,$3,$4,$5,$6) returning id",
            [
              scope.organizationId,
              input.id,
              scope.userId,
              input.visibility,
              input.body,
              input.requestKey,
            ],
          )
        ).rows[0].id;
        await audit(
          db,
          scope,
          "member.note_added",
          id,
          "Operational note added",
          null,
          { memberId: input.id, visibility: input.visibility },
        );
        return { id, requestId: scope.requestId };
      },
    );
  }
  async function withdraw(headers: Headers, raw: unknown) {
    const input = parse(withdrawNote, raw);
    return security.run(
      headers,
      { organizationId: input.organizationId },
      "members.manage",
      async (db, scope) => {
        await readMember(db, scope, input.id, true);
        const management = ["owner", "manager"].includes(scope.role);
        const note = (
          await db.query(
            "select id,visibility,author_user_id from gym.member_notes where organization_id=$1 and member_id=$2 and id=$3 and ($4 or visibility='operational')",
            [scope.organizationId, input.id, input.noteId, management],
          )
        ).rows[0];
        if (!note) throw new BusinessError("NOT_FOUND", "Note not found.");
        if (!management && note.author_user_id !== scope.userId)
          throw new BusinessError(
            "FORBIDDEN",
            "You can withdraw only your own notes.",
          );
        const saved = await db.query(
          "insert into gym.member_note_withdrawals(organization_id,note_id,actor_user_id,reason) values($1,$2,$3,$4) on conflict(organization_id,note_id) do nothing",
          [scope.organizationId, note.id, scope.userId, input.reason],
        );
        if (saved.rowCount)
          await audit(
            db,
            scope,
            "member.note_withdrawn",
            note.id,
            input.reason,
            null,
            { memberId: input.id, visibility: note.visibility },
          );
        return { requestId: scope.requestId };
      },
    );
  }
  return { get, contact, archive, note, withdraw };
}

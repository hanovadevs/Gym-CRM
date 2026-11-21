REVOKE ALL ON gym.member_contacts,gym.member_notes,gym.member_note_withdrawals,app_auth.mail_outbox FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON gym.member_contacts TO gym_runtime;
GRANT SELECT,INSERT ON gym.member_notes,gym.member_note_withdrawals TO gym_runtime;
GRANT SELECT,INSERT,UPDATE ON app_auth.mail_outbox TO gym_runtime;
ALTER TABLE gym.member_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym.member_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym.member_note_withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY contact_tenant ON gym.member_contacts TO gym_runtime USING (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY note_tenant ON gym.member_notes TO gym_runtime USING (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY withdrawal_tenant ON gym.member_note_withdrawals TO gym_runtime USING (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
-- Outbox is private global identity infrastructure like the maintained auth tables.
-- Only fixed server workflows may queue messages; no browser outbox access or arbitrary send endpoint.

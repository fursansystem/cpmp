-- An invitation now offers a role on one specific project, instead of membership of the
-- system as a whole. projects.contractor_id / consultant_id is written only when the
-- invited organization accepts, so no assignment exists without that organization's
-- consent.

ALTER TABLE "organization_invitations"
    ADD COLUMN IF NOT EXISTS "project_id" varchar,
    ADD COLUMN IF NOT EXISTS "role" text,
    ADD COLUMN IF NOT EXISTS "invited_organization_id" varchar,
    ADD COLUMN IF NOT EXISTS "responded_by_user_id" varchar;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'organization_invitations_project_id_fk'
    ) THEN
        ALTER TABLE "organization_invitations"
            ADD CONSTRAINT "organization_invitations_project_id_fk"
            FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'organization_invitations_invited_organization_id_fk'
    ) THEN
        ALTER TABLE "organization_invitations"
            ADD CONSTRAINT "organization_invitations_invited_organization_id_fk"
            FOREIGN KEY ("invited_organization_id") REFERENCES "organizations"("id") ON DELETE cascade;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'organization_invitations_responded_by_user_id_fk'
    ) THEN
        ALTER TABLE "organization_invitations"
            ADD CONSTRAINT "organization_invitations_responded_by_user_id_fk"
            FOREIGN KEY ("responded_by_user_id") REFERENCES "users"("id") ON DELETE set null;
    END IF;
END $$;

-- Only the "new organization registers itself" path has an email and a token now
ALTER TABLE "organization_invitations" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "organization_invitations" ALTER COLUMN "token_hash" DROP NOT NULL;

-- The old uniqueness rules were per developer/organization pair. They would block
-- inviting the same contractor to a second project, which is now the normal case.
DROP INDEX IF EXISTS "organization_invitations_accepted_link_idx";
DROP INDEX IF EXISTS "organization_invitations_pending_email_idx";

CREATE INDEX IF NOT EXISTS "organization_invitations_invited_org_idx"
    ON "organization_invitations" ("invited_organization_id");

CREATE INDEX IF NOT EXISTS "organization_invitations_project_idx"
    ON "organization_invitations" ("project_id");

-- One outstanding invitation per role per project
CREATE UNIQUE INDEX IF NOT EXISTS "organization_invitations_pending_project_role_idx"
    ON "organization_invitations" ("project_id", "role")
    WHERE status = 'pending';

-- Visibility in the Organizations section is derived from shared projects and live
-- invitations, so the rows backfilled in 0002 no longer carry any meaning. They have no
-- project and would show up as malformed invitations.
DELETE FROM "organization_invitations"
WHERE "project_id" IS NULL AND "token_hash" LIKE 'backfilled:%';

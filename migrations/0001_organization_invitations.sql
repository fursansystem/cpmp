-- Organization invitations: a developer invites a contractor/consultant by email and the
-- invitee registers its own organization from the link. An accepted row doubles as the
-- link between the inviting organization and the registered one.

CREATE TABLE IF NOT EXISTS "organization_invitations" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "inviting_organization_id" varchar NOT NULL,
    "invited_by_user_id" varchar,
    "email" text NOT NULL,
    "sector_type" text NOT NULL,
    "token_hash" text NOT NULL,
    "expires_at" text NOT NULL,
    "status" text DEFAULT 'pending' NOT NULL,
    "accepted_organization_id" varchar,
    "accepted_at" text,
    "created_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "organization_invitations_inviting_organization_id_fk"
        FOREIGN KEY ("inviting_organization_id") REFERENCES "organizations"("id") ON DELETE cascade,
    CONSTRAINT "organization_invitations_invited_by_user_id_fk"
        FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE set null,
    CONSTRAINT "organization_invitations_accepted_organization_id_fk"
        FOREIGN KEY ("accepted_organization_id") REFERENCES "organizations"("id") ON DELETE set null
);

CREATE UNIQUE INDEX IF NOT EXISTS "organization_invitations_token_hash_idx"
    ON "organization_invitations" ("token_hash");

CREATE INDEX IF NOT EXISTS "organization_invitations_inviting_org_idx"
    ON "organization_invitations" ("inviting_organization_id");

-- One accepted link per pair, so an organization invited twice is not listed twice
CREATE UNIQUE INDEX IF NOT EXISTS "organization_invitations_accepted_link_idx"
    ON "organization_invitations" ("inviting_organization_id", "accepted_organization_id")
    WHERE status = 'accepted';

-- At most one outstanding invitation per email from the same organization
CREATE UNIQUE INDEX IF NOT EXISTS "organization_invitations_pending_email_idx"
    ON "organization_invitations" ("inviting_organization_id", "email")
    WHERE status = 'pending';

-- Visibility now follows accepted invitations, so ownership of a record no longer
-- decides who can see or edit an organization.
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "created_by_organization_id";

-- Backfill the organization links that existed before visibility moved to invitations.
--
-- Until 0001, a developer saw the organizations its own record had created. That column
-- is gone and visibility now follows accepted invitations, which left the relationships
-- already expressed by live projects with nothing to stand on: a developer could no
-- longer see the contractor and consultant on its own project.
--
-- Each developer/contractor and developer/consultant pair on an existing project becomes
-- an accepted invitation, which is how that relationship is recorded from now on.
--
-- token_hash is NOT NULL and unique, but these rows were never emailed. They get a value
-- that is deliberately not a sha256 digest, so no real token can ever resolve to one of
-- them; status is already 'accepted', which the verify and accept endpoints both reject.

INSERT INTO organization_invitations (
    inviting_organization_id, email, sector_type, token_hash,
    expires_at, status, accepted_organization_id, accepted_at
)
SELECT DISTINCT ON (pair.developer_id, pair.party_id)
    pair.developer_id,
    party.email,
    party.sector_type,
    'backfilled:' || gen_random_uuid()::text,
    now()::text,
    'accepted',
    pair.party_id,
    now()::text
FROM (
    SELECT organization_id AS developer_id, contractor_id AS party_id
    FROM projects WHERE contractor_id IS NOT NULL
    UNION ALL
    SELECT organization_id AS developer_id, consultant_id AS party_id
    FROM projects WHERE consultant_id IS NOT NULL
) AS pair
JOIN organizations party ON party.id = pair.party_id
WHERE pair.developer_id <> pair.party_id
  AND NOT EXISTS (
      SELECT 1 FROM organization_invitations existing
      WHERE existing.inviting_organization_id = pair.developer_id
        AND existing.accepted_organization_id = pair.party_id
        AND existing.status = 'accepted'
  );

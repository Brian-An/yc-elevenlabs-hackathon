-- Video avatars move from HeyGen LiveAvatar to Anam, whose avatar IDs differ.
-- Generated characters fall back to the default avatar until they are regenerated, and the catalog job
-- describes the Anam avatars on its next run.
UPDATE "CustomPersona" SET "avatarId" = NULL WHERE "avatarId" IS NOT NULL;
DELETE FROM "AvatarProfile";

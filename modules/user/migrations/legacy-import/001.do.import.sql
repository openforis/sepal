-- One-off copy from the legacy `sepal_user` schema, kept out of the schema stream so a fresh database can
-- be built without it. It copies only if the source exists and the target is still empty, so it is
-- idempotent and never modifies the source. The legacy `rmb_message` / `rmb_message_processing` relics
-- belonged to the Groovy sepal-server and stay behind. Usernames are lowercased on the way in, and `id`
-- is copied verbatim because uid/gid are derived from it for users this module creates.
--
-- The runner executes the whole file as one multi-statement query, so the session @vars and
-- PREPARE/EXECUTE persist across statements.

SET @do_copy := (SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA='sepal_user' AND TABLE_NAME='sepal_user')
    AND (SELECT COUNT(*) FROM `sepal_user`)=0,
    'INSERT INTO `sepal_user` (id, username, name, email, organization, token, admin, system_user, status, google_refresh_token, google_access_token, google_access_token_expiration, creation_time, update_time, token_generation_time, last_login_time, email_notifications_enabled, intended_use, google_project_id, google_legacy_project, manual_map_rendering_enabled, privacy_policy_accepted, password_hash, ssh_public_key, uid, gid) SELECT id, LOWER(username), name, email, organization, token, admin, system_user, status, google_refresh_token, google_access_token, google_access_token_expiration, creation_time, update_time, token_generation_time, last_login_time, email_notifications_enabled, intended_use, google_project_id, google_legacy_project, manual_map_rendering_enabled, privacy_policy_accepted, password_hash, ssh_public_key, uid, gid FROM sepal_user.`sepal_user`',
    'DO 0'));
PREPARE _s FROM @do_copy; EXECUTE _s; DEALLOCATE PREPARE _s;

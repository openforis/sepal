INSERT INTO sepal_user (id, username, name, email, organization, token, admin, "system_user", status,
    google_refresh_token, google_access_token, google_access_token_expiration, creation_time, update_time,
    token_generation_time, last_login_time, email_notifications_enabled, intended_use, google_project_id,
    google_legacy_project, manual_map_rendering_enabled, privacy_policy_accepted, password_hash,
    ssh_public_key, uid, gid, revision)
SELECT id, username, name, email, organization, token, admin <> 0, "system_user" <> 0, status,
    google_refresh_token, google_access_token, google_access_token_expiration, creation_time, update_time,
    token_generation_time, last_login_time, email_notifications_enabled <> 0, intended_use, google_project_id,
    google_legacy_project <> 0, manual_map_rendering_enabled <> 0, privacy_policy_accepted <> 0, password_hash,
    ssh_public_key, uid, gid, revision
FROM mysql_source.sepal_user;

SELECT setval(pg_get_serial_sequence('sepal_user', 'id'), COALESCE(GREATEST(max(id), max(uid), max(gid)), 0) + 1, false)
FROM sepal_user;

INSERT INTO ssh_key (id, username, name, key_type, public_key, fingerprint, creation_time)
SELECT id, username, name, key_type, public_key, fingerprint, creation_time
FROM mysql_source.ssh_key;

SELECT setval(pg_get_serial_sequence('ssh_key', 'id'), COALESCE(max(id), 0) + 1, false) FROM ssh_key;

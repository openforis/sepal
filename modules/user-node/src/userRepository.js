import {getPool} from './db.js'
import {rowToUser, toISOStringJava} from './user.js'

const TABLE = 'sepal_user.sepal_user'

// Case-insensitive lookup — usernames are stored lowercased, but callers may pass any case.
const findByUsername = async username => {
    const [rows] = await getPool().query(
        `SELECT * FROM ${TABLE} WHERE LOWER(username) = LOWER(?)`, [username]
    )
    return rowToUser(rows[0])
}

const findByToken = async token => {
    const [rows] = await getPool().query(`SELECT * FROM ${TABLE} WHERE token = ?`, [token])
    return rowToUser(rows[0])
}

// Non-PENDING identities (ACTIVE + LOCKED) with an id-based POSIX identity, for the NSS snapshot.
// PENDING users (no uid/home yet) are excluded; locking is enforced at auth, not in NSS.
const listIdentities = async () => {
    const [rows] = await getPool().query(
        `SELECT id, username, name FROM ${TABLE} WHERE status <> 'PENDING' AND id >= 10000 ORDER BY id`
    )
    return rows
}

// All non-system users, newest first (matches the Java /list which filters systemUser out).
const listUsers = async () => {
    const [rows] = await getPool().query(
        `SELECT * FROM ${TABLE} WHERE system_user = 0 ORDER BY creation_time DESC`
    )
    return rows.map(rowToUser)
}

const emailNotificationsEnabled = async email => {
    const [rows] = await getPool().query(
        `SELECT email_notifications_enabled AS enabled FROM ${TABLE} WHERE email = ?`,
        [email]
    )
    return rows.length ? !!rows[0].enabled : false
}

// {timestamp: ISO string} for a user with a login, or {} when never logged in / unknown.
// Matches Java's fixed key shape (consumer user-storage does .map(({timestamp}) => timestamp)).
const mostRecentLogin = async username => {
    const [rows] = await getPool().query(
        `SELECT last_login_time FROM ${TABLE}
         WHERE LOWER(username) = LOWER(?) AND last_login_time IS NOT NULL`, [username]
    )
    return rows.length ? {timestamp: toISOStringJava(rows[0].last_login_time)} : {}
}

// {username: ISO string, ...} for every non-system user that has logged in.
// Keys are lowercased to match Java's behaviour.
const mostRecentLoginByUser = async () => {
    const [rows] = await getPool().query(
        `SELECT username, last_login_time FROM ${TABLE} WHERE last_login_time IS NOT NULL AND system_user = 0`
    )
    return Object.fromEntries(
        rows.map(row => [row.username.toLowerCase(), toISOStringJava(row.last_login_time)])
    )
}

const setLastLoginTime = async username => {
    await getPool().query(
        `UPDATE ${TABLE} SET last_login_time = NOW() WHERE LOWER(username) = LOWER(?)`, [username]
    )
}

// Write the five google_* columns (and update_time). A null `tokens` clears them (revoke).
const updateGoogleTokens = async (username, tokens) => {
    await getPool().query(
        `UPDATE ${TABLE}
         SET google_refresh_token = ?, google_access_token = ?, google_access_token_expiration = ?,
             google_project_id = ?, google_legacy_project = ?, update_time = NOW()
         WHERE LOWER(username) = LOWER(?)`,
        [
            tokens?.refreshToken ?? null,
            tokens?.accessToken ?? null,
            tokens ? new Date(tokens.accessTokenExpiryDate) : null,
            tokens?.projectId ?? null,
            tokens?.legacyProject ? 1 : 0,
            username
        ]
    )
}

const updatePassword = async (username, passwordHash) => {
    await getPool().query(
        `UPDATE ${TABLE} SET password_hash = ? WHERE LOWER(username) = LOWER(?)`,
        [passwordHash, username]
    )
}

// Mirrors the Java updateUserDetails column set; update_time = NOW().
const updateUserDetails = async ({username, name, email, organization, intendedUse,
    emailNotificationsEnabled, manualMapRenderingEnabled, admin}) => {
    await getPool().query(
        `UPDATE ${TABLE}
         SET name = ?, email = ?, organization = ?, intended_use = ?,
             email_notifications_enabled = ?, manual_map_rendering_enabled = ?, admin = ?, update_time = NOW()
         WHERE LOWER(username) = LOWER(?)`,
        [name, email, organization, intendedUse,
            emailNotificationsEnabled, manualMapRenderingEnabled, admin, username]
    )
}

const acceptPrivacyPolicy = async username => {
    await getPool().query(
        `UPDATE ${TABLE} SET privacy_policy_accepted = TRUE WHERE LOWER(username) = LOWER(?)`,
        [username]
    )
}

const updateStatus = async (username, status) => {
    await getPool().query(
        `UPDATE ${TABLE} SET status = ? WHERE LOWER(username) = LOWER(?)`,
        [status, username]
    )
}

// Set a (new or reused) token and stamp token_generation_time = NOW(). Used by password
// reset-request and unlock to (re)issue the link token.
const updateToken = async (username, token) => {
    await getPool().query(
        `UPDATE ${TABLE} SET token = ?, token_generation_time = NOW() WHERE LOWER(username) = LOWER(?)`,
        [token, username]
    )
}

// Clear the token after it is consumed (activate/reset). token_generation_time is NOT NULL, so
// only the token itself is nulled.
const invalidateToken = async token => {
    await getPool().query(`UPDATE ${TABLE} SET token = NULL WHERE token = ?`, [token])
}

const findByEmail = async email => {
    const [rows] = await getPool().query(`SELECT * FROM ${TABLE} WHERE email = ?`, [email])
    return rowToUser(rows[0])
}

// Inserts a PENDING user with an activation token; returns the new auto-increment id (= uid = gid).
const insertUser = async ({username, name, email, organization, intendedUse, token}) => {
    const [result] = await getPool().query(
        `INSERT INTO ${TABLE}
         (username, name, email, organization, intended_use, email_notifications_enabled,
          manual_map_rendering_enabled, token, token_generation_time, admin, system_user, status,
          creation_time, update_time)
         VALUES (?, ?, ?, ?, ?, 1, 0, ?, NOW(), 0, 0, 'PENDING', NOW(), NOW())`,
        [username, name, email, organization, intendedUse ?? null, token]
    )
    return result.insertId
}

const updateSshPublicKey = async (username, sshPublicKey) => {
    await getPool().query(
        `UPDATE ${TABLE} SET ssh_public_key = ? WHERE LOWER(username) = LOWER(?)`,
        [sshPublicKey, username]
    )
}

export {
    acceptPrivacyPolicy,
    emailNotificationsEnabled,
    findByEmail,
    findByToken,
    findByUsername,
    insertUser,
    invalidateToken,
    listIdentities,
    listUsers,
    mostRecentLogin,
    mostRecentLoginByUser,
    setLastLoginTime,
    updateGoogleTokens,
    updatePassword,
    updateSshPublicKey,
    updateStatus,
    updateToken,
    updateUserDetails
}

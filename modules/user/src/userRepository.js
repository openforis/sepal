import {storedUsername} from '#sepal/username'

import {rowToUser, toISOString} from './user.js'

// insertUser is the only statement that writes `username`, so it is the only one that normalizes
// (see #sepal/username). Every query below passes the caller's value through untouched: the column
// is ascii_general_ci, so `WHERE username = ?` matches any case and still uses the unique index,
// which a LOWER() wrapper would have suppressed.
export class UserRepository {
    #db

    constructor(db) {
        this.#db = db
    }

    findByUsername(username) {
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query(
                'SELECT * FROM sepal_user WHERE username = ?', [username]
            )
            return rowToUser(rows[0])
        })
    }

    findByToken(token) {
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query('SELECT * FROM sepal_user WHERE token = ?', [token])
            return rowToUser(rows[0])
        })
    }

    // Non-PENDING identities (ACTIVE + LOCKED) that have a POSIX uid/gid, for the NSS snapshot. PENDING
    // users (no uid/home yet) are excluded, as are any rows still missing uid/gid; locking is enforced
    // at auth, not in NSS. uid/gid are the real POSIX numbers (migrated from LDAP, or = id for users
    // created by this module) — not derived from id.
    listIdentities() {
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query(
                `SELECT id, username, name, uid, gid FROM sepal_user
                 WHERE status <> 'PENDING' AND uid IS NOT NULL AND uid >= 10000 ORDER BY uid`
            )
            return rows
        })
    }

    listUsers() {
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query(
                'SELECT * FROM sepal_user WHERE system_user = 0 ORDER BY creation_time DESC'
            )
            return rows.map(rowToUser)
        })
    }

    emailNotificationsEnabled(email) {
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query(
                'SELECT email_notifications_enabled AS enabled FROM sepal_user WHERE email = ?',
                [email]
            )
            return rows.length ? !!rows[0].enabled : false
        })
    }

    // The fixed {timestamp} key is a contract with user-storage, which maps straight onto it.
    mostRecentLogin(username) {
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query(
                `SELECT last_login_time FROM sepal_user
                 WHERE username = ? AND last_login_time IS NOT NULL`, [username]
            )
            return rows.length ? {timestamp: toISOString(rows[0].last_login_time)} : {}
        })
    }

    mostRecentLoginByUser() {
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query(
                'SELECT username, last_login_time FROM sepal_user WHERE last_login_time IS NOT NULL AND system_user = 0'
            )
            return Object.fromEntries(
                rows.map(row => [row.username, toISOString(row.last_login_time)])
            )
        })
    }

    setLastLoginTime(username) {
        return this.#db.withConnection(async connection => {
            await connection.query(
                'UPDATE sepal_user SET last_login_time = NOW() WHERE username = ?', [username]
            )
        })
    }

    // A null `tokens` clears the stored credentials — that is how a revoke is written.
    updateGoogleTokens(username, tokens) {
        return this.#db.withConnection(async connection => {
            await connection.query(
                `UPDATE sepal_user
                 SET google_refresh_token = ?, google_access_token = ?, google_access_token_expiration = ?,
                     google_project_id = ?, google_legacy_project = ?, update_time = NOW()
                 WHERE username = ?`,
                [
                    tokens?.refreshToken ?? null,
                    tokens?.accessToken ?? null,
                    tokens ? new Date(tokens.accessTokenExpiryDate) : null,
                    tokens?.projectId ?? null,
                    tokens?.legacyProject ? 1 : 0,
                    username
                ]
            )
        })
    }

    updatePassword(username, passwordHash) {
        return this.#db.withConnection(async connection => {
            await connection.query(
                'UPDATE sepal_user SET password_hash = ? WHERE username = ?',
                [passwordHash, username]
            )
        })
    }

    updateUserDetails({username, name, email, organization, intendedUse,
        emailNotificationsEnabled, manualMapRenderingEnabled, admin}) {
        return this.#db.withConnection(async connection => {
            await connection.query(
                `UPDATE sepal_user
                 SET name = ?, email = ?, organization = ?, intended_use = ?,
                     email_notifications_enabled = ?, manual_map_rendering_enabled = ?, admin = ?, update_time = NOW()
                 WHERE username = ?`,
                [name, email, organization, intendedUse,
                    emailNotificationsEnabled, manualMapRenderingEnabled, admin, username]
            )
        })
    }

    acceptPrivacyPolicy(username) {
        return this.#db.withConnection(async connection => {
            await connection.query(
                'UPDATE sepal_user SET privacy_policy_accepted = TRUE WHERE username = ?',
                [username]
            )
        })
    }

    updateStatus(username, status) {
        return this.#db.withConnection(async connection => {
            await connection.query(
                'UPDATE sepal_user SET status = ? WHERE username = ?',
                [status, username]
            )
        })
    }

    updateToken(username, token) {
        return this.#db.withConnection(async connection => {
            await connection.query(
                'UPDATE sepal_user SET token = ?, token_generation_time = NOW() WHERE username = ?',
                [token, username]
            )
        })
    }

    // token_generation_time is NOT NULL, so only the token itself can be cleared.
    invalidateToken(token) {
        return this.#db.withConnection(async connection => {
            await connection.query('UPDATE sepal_user SET token = NULL WHERE token = ?', [token])
        })
    }

    findByEmail(email) {
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query('SELECT * FROM sepal_user WHERE email = ?', [email])
            return rowToUser(rows[0])
        })
    }

    // uid = gid = id is collision-free against the identities migrated from LDAP: that migration
    // bumped the table's AUTO_INCREMENT past every uid and gid it brought over.
    insertUser({username, name, email, organization, intendedUse, token}) {
        return this.#db.withConnection(async connection => {
            const [result] = await connection.query(
                `INSERT INTO sepal_user
                 (username, name, email, organization, intended_use, email_notifications_enabled,
                  manual_map_rendering_enabled, token, token_generation_time, admin, system_user, status,
                  creation_time, update_time)
                 VALUES (?, ?, ?, ?, ?, 1, 0, ?, NOW(), 0, 0, 'PENDING', NOW(), NOW())`,
                [storedUsername(username), name, email, organization, intendedUse ?? null, token]
            )
            await this.#assignDerivedPosixIds(connection, result.insertId)
            return result.insertId
        })
    }

    // Only fills NULLs, so it can never overwrite a uid or gid migrated from LDAP.
    assignDerivedPosixIds(id) {
        return this.#db.withConnection(connection => this.#assignDerivedPosixIds(connection, id))
    }

    updateSshPublicKey(username, sshPublicKey) {
        return this.#db.withConnection(async connection => {
            await connection.query(
                'UPDATE sepal_user SET ssh_public_key = ? WHERE username = ?',
                [sshPublicKey, username]
            )
        })
    }

    async #assignDerivedPosixIds(connection, id) {
        await connection.query(
            'UPDATE sepal_user SET uid = id, gid = id WHERE id = ? AND (uid IS NULL OR gid IS NULL)', [id]
        )
    }
}

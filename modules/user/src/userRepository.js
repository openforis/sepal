import {isUniqueViolation} from '#sepal/db/postgres'
import {storedUsername} from '#sepal/username'

import {TOKEN_MAX_AGE_MS} from './tokens.js'
import {rowToUser, toISOString} from './user.js'
import {isText} from './validation.js'

// Every write that changes the record bumps `revision`, the version optimistic locking checks. The
// login stamp is the one exception: it records activity, not a change to the record.
const BUMP = 'revision = revision + 1, update_time = now()'

// A write that would give a user the username or email of another. The unique indexes decide, so two
// concurrent writers cannot both take one.
export class DuplicateUserError extends Error {}

// insertUser is the only statement that writes `username`, so it is the only one that normalizes
// (see #sepal/username). Every query below passes the caller's value through untouched: the column
// is citext, so `WHERE username = $1` matches any case and still uses the unique index, which a
// LOWER() wrapper would have suppressed.
//
// What every statement does check is that the username, token or email it selects on is a string, so
// that no caller — HTTP or not — can reach SQL with a value that is not (see isText). A lookup answers as it does for a value it does not know; a write refuses outright,
// because reporting success for a selector that matched nothing is how a caller comes to believe a
// credential was changed when it was not.
export class UserRepository {
    #db

    constructor(db) {
        this.#db = db
    }

    async findByUsername(username) {
        if (!isText(username)) {
            return null
        }
        return this.#db.withConnection(async connection => {
            const {rows} = await connection.query(
                'SELECT * FROM sepal_user WHERE username = $1', [username]
            )
            return rowToUser(rows[0])
        })
    }

    async findByToken(token) {
        if (!isText(token)) {
            return null
        }
        return this.#db.withConnection(async connection => {
            const {rows} = await connection.query('SELECT * FROM sepal_user WHERE token = $1', [token])
            return rowToUser(rows[0])
        })
    }

    // Non-PENDING identities (ACTIVE + LOCKED) that have a POSIX uid/gid, for the NSS snapshot. PENDING
    // users (no uid/home yet) are excluded, as are any rows still missing uid/gid; locking is enforced
    // at auth, not in NSS. uid/gid are the real POSIX numbers (migrated from LDAP, or = id for users
    // created by this module) — not derived from id.
    listIdentities() {
        return this.#db.withConnection(async connection => {
            const {rows} = await connection.query(
                `SELECT id, username, name, uid, gid FROM sepal_user
                 WHERE status <> 'PENDING' AND uid IS NOT NULL AND uid >= 10000 ORDER BY uid`
            )
            return rows
        })
    }

    listUsers() {
        return this.#db.withConnection(async connection => {
            const {rows} = await connection.query(
                'SELECT * FROM sepal_user WHERE NOT "system_user" ORDER BY creation_time DESC'
            )
            return rows.map(rowToUser)
        })
    }

    async emailNotificationsEnabled(email) {
        if (!isText(email)) {
            return false
        }
        return this.#db.withConnection(async connection => {
            const {rows} = await connection.query(
                'SELECT email_notifications_enabled AS enabled FROM sepal_user WHERE email = $1',
                [email]
            )
            return rows.length ? !!rows[0].enabled : false
        })
    }

    // The fixed {timestamp} key is a contract with storage, which maps straight onto it.
    async mostRecentLogin(username) {
        if (!isText(username)) {
            return {}
        }
        return this.#db.withConnection(async connection => {
            const {rows} = await connection.query(
                `SELECT last_login_time FROM sepal_user
                 WHERE username = $1 AND last_login_time IS NOT NULL`, [username]
            )
            return rows.length ? {timestamp: toISOString(rows[0].last_login_time)} : {}
        })
    }

    mostRecentLoginByUser() {
        return this.#db.withConnection(async connection => {
            const {rows} = await connection.query(
                'SELECT username, last_login_time FROM sepal_user WHERE last_login_time IS NOT NULL AND NOT "system_user"'
            )
            return Object.fromEntries(
                rows.map(row => [row.username, toISOString(row.last_login_time)])
            )
        })
    }

    async setLastLoginTime(username) {
        requireSelector(username)
        return this.#db.withConnection(async connection => {
            await connection.query(
                'UPDATE sepal_user SET last_login_time = now() WHERE username = $1', [username]
            )
        })
    }

    // A null `tokens` clears the stored credentials — that is how a revoke is written.
    async updateGoogleTokens(username, tokens) {
        requireSelector(username)
        return this.#db.withConnection(async connection => {
            await connection.query(
                `UPDATE sepal_user
                 SET google_refresh_token = $1, google_access_token = $2, google_access_token_expiration = $3,
                     google_project_id = $4, google_legacy_project = $5, ${BUMP}
                 WHERE username = $6`,
                [
                    tokens?.refreshToken ?? null,
                    tokens?.accessToken ?? null,
                    tokens ? new Date(tokens.accessTokenExpiryDate) : null,
                    tokens?.projectId ?? null,
                    !!tokens?.legacyProject,
                    username
                ]
            )
        })
    }

    // A reset link issued before the change must not be able to undo it.
    async updatePassword(username, passwordHash) {
        requireSelector(username)
        return this.#db.withConnection(async connection => {
            await connection.query(
                `UPDATE sepal_user SET password_hash = $1, token = NULL, ${BUMP} WHERE username = $2`,
                [passwordHash, username]
            )
        })
    }

    async resetPasswordIfTokenIsValid({username, token, passwordHash}) {
        requireSelector(username)
        requireSelector(token)
        return this.#db.withConnection(async connection => {
            const {rowCount} = await connection.query(
                `UPDATE sepal_user SET password_hash = $1, token = NULL, status = 'ACTIVE', ${BUMP}
                 WHERE username = $2 AND token = $3 AND status IN ('PENDING', 'ACTIVE')
                   AND token_generation_time >= now() - make_interval(secs => $4)`,
                [passwordHash, username, token, TOKEN_MAX_AGE_MS / 1000]
            )
            return rowCount > 0
        })
    }

    async upgradePasswordHashIfUnchanged({username, verifiedHash, upgradedHash}) {
        requireSelector(username)
        return this.#db.withConnection(async connection => {
            const {rowCount} = await connection.query(
                `UPDATE sepal_user SET password_hash = $1, token = NULL, ${BUMP}
                 WHERE username = $2 AND password_hash = $3`,
                [upgradedHash, username, verifiedHash]
            )
            return rowCount > 0
        })
    }

    // With a `revision`, the write only happens if the row still has it — the check and the write
    // are one statement, so two callers holding the same revision cannot both get through. Returns
    // whether a row was written.
    //
    // A new address voids the reset link sent to the old one. Every SET expression reads the row as it was
    // before the update, so the token is compared against the old address.
    async updateUserDetails({username, name, email, organization, intendedUse,
        emailNotificationsEnabled, manualMapRenderingEnabled, admin, revision}) {
        requireSelector(username)
        return this.#db.withConnection(async connection => {
            const {rowCount} = await connection.query(
                `UPDATE sepal_user
                 SET token = CASE WHEN email IS NOT DISTINCT FROM $1::citext THEN token END,
                     name = $2, email = $1::citext, organization = $3, intended_use = $4,
                     email_notifications_enabled = $5, manual_map_rendering_enabled = $6,
                     admin = COALESCE($7::boolean, admin), ${BUMP}
                 WHERE username = $8 AND ($9::integer IS NULL OR revision = $9::integer)`,
                [email, name, organization, intendedUse,
                    emailNotificationsEnabled, manualMapRenderingEnabled, admin ?? null, username,
                    revision ?? null]
            ).catch(rethrowDuplicate)
            return rowCount > 0
        })
    }

    async acceptPrivacyPolicy(username) {
        requireSelector(username)
        return this.#db.withConnection(async connection => {
            await connection.query(
                `UPDATE sepal_user SET privacy_policy_accepted = TRUE, ${BUMP} WHERE username = $1`,
                [username]
            )
        })
    }

    async updateStatus(username, status) {
        requireSelector(username)
        return this.#db.withConnection(async connection => {
            await connection.query(
                `UPDATE sepal_user SET status = $1, ${BUMP} WHERE username = $2`,
                [status, username]
            )
        })
    }

    async updateToken(username, token) {
        requireSelector(username)
        return this.#db.withConnection(async connection => {
            await connection.query(
                `UPDATE sepal_user SET token = $1, token_generation_time = now(), ${BUMP} WHERE username = $2`,
                [token, username]
            )
        })
    }

    async findByEmail(email) {
        if (!isText(email)) {
            return null
        }
        return this.#db.withConnection(async connection => {
            const {rows} = await connection.query('SELECT * FROM sepal_user WHERE email = $1', [email])
            return rowToUser(rows[0])
        })
    }

    // uid = gid = id is collision-free against the identities migrated from LDAP: the identity sequence
    // starts past every id, uid and gid the import brought over.
    insertUser({username, name, email, organization, intendedUse, token}) {
        return this.#db.withConnection(async connection => {
            const {rows: [{id}]} = await connection.query(
                `INSERT INTO sepal_user
                 (username, name, email, organization, intended_use, email_notifications_enabled,
                  manual_map_rendering_enabled, token, token_generation_time, admin, "system_user", status,
                  creation_time, update_time)
                 VALUES ($1, $2, $3, $4, $5, true, false, $6, now(), false, false, 'PENDING', now(), now())
                 RETURNING id`,
                [storedUsername(username), name, email, organization, intendedUse ?? null, token]
            ).catch(rethrowDuplicate)
            await this.#assignDerivedPosixIds(connection, id)
            return id
        })
    }

    // Only fills NULLs, so it can never overwrite a uid or gid migrated from LDAP.
    assignDerivedPosixIds(id) {
        return this.#db.withConnection(connection => this.#assignDerivedPosixIds(connection, id))
    }

    async updateSshPublicKey(username, sshPublicKey) {
        requireSelector(username)
        return this.#db.withConnection(async connection => {
            await connection.query(
                `UPDATE sepal_user SET ssh_public_key = $1, ${BUMP} WHERE username = $2`,
                [sshPublicKey, username]
            )
        })
    }

    async #assignDerivedPosixIds(connection, id) {
        await connection.query(
            `UPDATE sepal_user
             SET uid = COALESCE(uid, id), gid = COALESCE(gid, id)
             WHERE id = $1 AND (uid IS NULL OR gid IS NULL)`, [id]
        )
    }
}

const requireSelector = selector => {
    if (!isText(selector)) {
        throw new Error('Invalid selector')
    }
}

const rethrowDuplicate = error => {
    throw isUniqueViolation(error) ? new DuplicateUserError(error.message) : error
}

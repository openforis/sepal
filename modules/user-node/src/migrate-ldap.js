// One-shot, idempotent migration from LDAP into the sepal_user DB of: password hash, SSH public key,
// and POSIX uid/gid. uid (LDAP uidNumber) and gid (the entry's per-user-group gidNumber) are stored
// verbatim because on-disk files are owned by those numbers, and they do NOT equal sepal_user.id —
// the DB auto-increment and the ldapscripts uid/gid sequences drifted apart independently. After
// migrating, the table AUTO_INCREMENT is bumped past every existing uid/gid so future user-node
// users (which get uid = gid = id) cannot collide with a migrated identity. Pure helpers are kept
// separate from IO so they can be unit-tested in isolation.

import {getLogger} from '#sepal/log'

import {createMigrationPool, DATABASE_NAME} from './db.js'
import {createLdapClient} from './ldapClient.js'

const log = getLogger('migrate-ldap')

// LDAP userPassword may arrive as a Buffer (binary attribute) or a string; normalize to the
// scheme-prefixed ASCII hash (e.g. '{SSHA}...'), or null when absent/empty.
const decodeHash = value => {
    if (value == null) {
        return null
    }
    const string = Buffer.isBuffer(value) ? value.toString('utf8') : String(value)
    return string.length ? string : null
}

// Partition LDAP people against existing DB users, matching case-insensitively because the
// sepal_user table stores usernames lowercased (see the V13 username-case migration).
// matched/ldapOnly preserve the LDAP spelling; dbOnly preserves the DB spelling.
const reconcile = (ldapUsernames, dbUsernames) => {
    const toLowerSet = names => new Set(names.map(name => name.toLowerCase()))
    const dbSet = toLowerSet(dbUsernames)
    const ldapSet = toLowerSet(ldapUsernames)
    return {
        matched: ldapUsernames.filter(name => dbSet.has(name.toLowerCase())),
        ldapOnly: ldapUsernames.filter(name => !dbSet.has(name.toLowerCase())),
        dbOnly: dbUsernames.filter(name => !ldapSet.has(name.toLowerCase()))
    }
}

const ldapConfig = () => ({
    host: process.env.LDAP_HOST || 'ldap',
    bindDn: process.env.LDAP_ADMIN_DN || 'cn=admin,dc=sepal,dc=org',
    password: process.env.LDAP_ADMIN_PASSWORD,
    baseDn: process.env.LDAP_BASE_DN || 'dc=sepal,dc=org'
})

const loadDbUsers = async pool => {
    const [rows] = await pool.query(`SELECT id, username FROM ${DATABASE_NAME}.sepal_user`)
    return rows.map(row => ({id: row.id, username: row.username}))
}

const updateUserCredentials = async (pool, user) => {
    const passwordHash = decodeHash(user.passwordValue)
    if (!passwordHash) {
        log.warn(`No userPassword for '${user.username}' — leaving password_hash NULL`)
    }
    const uid = Number.isInteger(user.uid) ? user.uid : null
    const gid = Number.isInteger(user.gid) ? user.gid : null
    if (uid === null || gid === null) {
        log.warn(`Missing uidNumber/gidNumber for '${user.username}' (uid=${user.uid}, gid=${user.gid}) — leaving uid/gid NULL`)
    }
    await pool.query(
        `UPDATE ${DATABASE_NAME}.sepal_user
         SET password_hash = ?, ssh_public_key = ?, uid = ?, gid = ?
         WHERE LOWER(username) = LOWER(?)`,
        [passwordHash, user.sshPublicKey, uid, gid, user.username]
    )
}

// Bump the table's AUTO_INCREMENT above every existing id/uid/gid so future user-node users (which
// get uid = gid = id) cannot collide with a migrated LDAP identity in the uid or gid namespace.
// MySQL ignores an AUTO_INCREMENT lower than the current value, so this only ever raises it.
const reserveIdRangeAboveExisting = async pool => {
    const [[{nextId}]] = await pool.query(
        `SELECT GREATEST(
                    COALESCE(MAX(id), 0),
                    COALESCE(MAX(uid), 0),
                    COALESCE(MAX(gid), 0)
                ) + 1 AS nextId
         FROM ${DATABASE_NAME}.sepal_user`
    )
    const next = parseInt(nextId, 10)
    await pool.query(`ALTER TABLE ${DATABASE_NAME}.sepal_user AUTO_INCREMENT = ${next}`)
    log.info(`Reserved id range: AUTO_INCREMENT set to ${next} (above all existing id/uid/gid)`)
}

const migrate = async () => {
    const config = ldapConfig()
    if (!config.password) {
        throw new Error('Missing LDAP_ADMIN_PASSWORD')
    }
    const ldap = createLdapClient(config)
    const pool = await createMigrationPool()
    try {
        await ldap.connect()
        const ldapUsers = await ldap.searchUsers()
        const dbUsers = await loadDbUsers(pool)

        const {matched, ldapOnly, dbOnly} = reconcile(
            ldapUsers.map(user => user.username),
            dbUsers.map(user => user.username)
        )
        const matchedSet = new Set(matched.map(name => name.toLowerCase()))
        const matchedLdapUsers = ldapUsers.filter(user => matchedSet.has(user.username.toLowerCase()))

        for (const user of matchedLdapUsers) {
            await updateUserCredentials(pool, user)
        }

        await reserveIdRangeAboveExisting(pool)

        log.info(`Migration summary: ${matched.length} users updated, ` +
            `${ldapOnly.length} LDAP-only skipped, ${dbOnly.length} DB-only untouched`)
        if (ldapOnly.length) {
            log.warn(`LDAP-only users (no DB row, skipped): ${ldapOnly.join(', ')}`)
        }
        if (dbOnly.length) {
            log.warn(`DB-only users (no LDAP entry, left as-is): ${dbOnly.join(', ')}`)
        }
    } finally {
        await ldap.disconnect().catch(() => {})
        await pool.end().catch(() => {})
    }
}

const isMainModule = process.argv[1] && process.argv[1].endsWith('migrate-ldap.js')
if (isMainModule) {
    migrate()
        .then(() => {
            log.info('Migration complete')
            process.exit(0)
        })
        .catch(error => {
            log.fatal('Migration failed', error)
            process.exit(1)
        })
}

export {decodeHash, migrate, reconcile}

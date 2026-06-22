// One-shot, idempotent migration of credentials (password hash + SSH public key) from LDAP into
// the sepal_user DB. POSIX uid/gid are NOT migrated — they are derived as uid = gid = sepal_user.id
// (which already equals the LDAP uidNumber; this is asserted before writing). Pure helpers are kept
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

// Safety check for the uid = gid = id model: on-disk files are owned by the LDAP uidNumber, so the
// DB id must equal it for every matched user. Returns the offending {username, id, uid} list (empty
// when all match). dbByLowerName maps a lowercased username to its {id, username} DB row.
const idMismatches = (ldapUsers, dbByLowerName) =>
    ldapUsers
        .map(user => ({user, db: dbByLowerName.get(user.username.toLowerCase())}))
        .filter(({db}) => db)
        .filter(({user, db}) => user.uid !== db.id)
        .map(({user, db}) => ({username: db.username, id: db.id, uid: user.uid}))

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
    await pool.query(
        `UPDATE ${DATABASE_NAME}.sepal_user
         SET password_hash = ?, ssh_public_key = ?
         WHERE LOWER(username) = LOWER(?)`,
        [passwordHash, user.sshPublicKey, user.username]
    )
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
        const dbByLowerName = new Map(dbUsers.map(user => [user.username.toLowerCase(), user]))

        const {matched, ldapOnly, dbOnly} = reconcile(
            ldapUsers.map(user => user.username),
            dbUsers.map(user => user.username)
        )
        const matchedSet = new Set(matched.map(name => name.toLowerCase()))
        const matchedLdapUsers = ldapUsers.filter(user => matchedSet.has(user.username.toLowerCase()))

        // Guard the uid = gid = id assumption: refuse to migrate if any DB id != on-disk uidNumber.
        const mismatches = idMismatches(matchedLdapUsers, dbByLowerName)
        if (mismatches.length) {
            throw new Error(
                `id != uidNumber for ${mismatches.length} user(s) — uid=gid=id is unsafe ` +
                '(on-disk ownership mismatch): ' +
                mismatches.map(m => `${m.username}(id=${m.id}, uid=${m.uid})`).join(', ')
            )
        }

        for (const user of matchedLdapUsers) {
            await updateUserCredentials(pool, user)
        }

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

export {decodeHash, idMismatches, migrate, reconcile}

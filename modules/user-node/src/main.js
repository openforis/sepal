import logConfig from '#config/log.json' with {type: 'json'}
import * as server from '#sepal/httpServer'
import {configureServer, getLogger} from '#sepal/log'
import {initMessageQueue} from '#sepal/messageQueue'

import {bootstrap} from './bootstrap.js'
import {amqpUri, port} from './config.js'
import {initializeDatabase} from './db.js'
import {email$} from './email.js'
import {userLocked$, userUpdated$} from './events.js'
import {migrate} from './migrate-ldap.js'
import {routes, wsRoutes} from './routes.js'

configureServer(logConfig)

const log = getLogger('main')

// Transitional: while LDAP is still deployed, migrate existing users' credentials (password hash +
// SSH public key) into the DB on every start. Idempotent (upserts) and self-healing. Guarded on
// LDAP_ADMIN_PASSWORD so it is a no-op once LDAP is decommissioned (phase 6), and never aborts
// startup on failure — a migration error must not take the service down. Remove with LDAP.
const migrateLdapIfConfigured = async () => {
    if (!process.env.LDAP_ADMIN_PASSWORD) {
        log.info('LDAP migration skipped: LDAP_ADMIN_PASSWORD not set')
        return
    }
    try {
        await migrate()
    } catch (error) {
        log.error('LDAP migration failed; continuing startup', error)
    }
}

const main = async () => {
    await initializeDatabase()
    // Migrate first so existing users' real uid/gid + credentials are in place; bootstrap then only
    // fills genuinely-missing system admins (fresh install, where it derives uid = gid = id).
    await migrateLdapIfConfigured()
    await bootstrap()
    await initMessageQueue(amqpUri, {
        publishers: [
            {key: 'user.UserUpdated', publish$: userUpdated$},
            {key: 'user.UserLocked', publish$: userLocked$},
            {key: 'email.sendToAddress', publish$: email$}
        ]
    })
    await server.start({port, routes, wsRoutes})
    log.info('Initialized')
}

main().catch(log.fatal)

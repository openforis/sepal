import logConfig from '#config/log.json' with {type: 'json'}
import * as server from '#sepal/httpServer'
import {configureServer, getLogger} from '#sepal/log'
import {initMessageQueue} from '#sepal/messageQueue'

import {createBootstrap} from './bootstrap.js'
import {amqpUri, googleOauthCallbackBaseUrl, googleOauthClientId, googleOauthClientSecret, port} from './config.js'
import {saveCredentials} from './credentials.js'
import {hashPassword} from './crypto.js'
import {initializeDb} from './db.js'
import {email$} from './email.js'
import {publishUserUpdated, userLocked$, userUpdated$} from './events.js'
import {GoogleOAuth} from './googleOAuth.js'
import {GoogleService} from './googleService.js'
import {provision} from './provisioning.js'
import {createRoutes, wsRoutes} from './routes.js'
import {UserApi} from './userApi.js'
import {createEnsureProvisioned} from './userProvisioning.js'
import {UserRepository} from './userRepository.js'

configureServer(logConfig)

const log = getLogger('main')

const main = async () => {
    const db = await initializeDb()
    const repository = new UserRepository(db)
    const clock = () => new Date()
    const googleOAuth = new GoogleOAuth({
        clientId: googleOauthClientId,
        clientSecret: googleOauthClientSecret,
        callbackBaseUrl: googleOauthCallbackBaseUrl,
        fetchFn: (url, options) => fetch(url, options),
        clock
    })
    const googleService = new GoogleService({
        repository, googleOAuth, saveCredentials, publishUserUpdated, clock
    })
    const ensureProvisioned = createEnsureProvisioned({repository, provision})
    const bootstrap = createBootstrap({
        repository,
        provision,
        hashPassword,
        readSecret: name => process.env[name]
    })
    const userApi = new UserApi({repository, googleService, googleOAuth, ensureProvisioned})

    // bootstrap only fills genuinely-missing system admins (fresh install, where it derives
    // uid = gid = id); on existing installs every user already has real uid/gid + credentials.
    await bootstrap()
    await initMessageQueue(amqpUri, {
        publishers: [
            {key: 'user.UserUpdated', publish$: userUpdated$},
            {key: 'user.UserLocked', publish$: userLocked$},
            {key: 'email.sendToAddress', publish$: email$}
        ]
    })
    await server.start({port, routes: createRoutes(userApi), wsRoutes})
    log.info('Initialized')
}

main().catch(log.fatal)

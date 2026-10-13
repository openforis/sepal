import logConfig from '#config/log.json' with {type: 'json'}
import * as server from '#sepal/httpServer'
import {configureServer, getLogger} from '#sepal/log'
import {initMessageQueue} from '#sepal/messageQueue'
import {moduleWs$} from '#sepal/ws/module'

import {Access} from './access.js'
import {Attachments} from './attachments.js'
import {createBrowserWs} from './browserWs.js'
import {amqpUri, port, s3, sepalHost} from './config.js'
import {DataBrowser} from './dataBrowser.js'
import {initializeDb} from './db.js'
import {emitUserDataSize, USER_DATA_PUBLISHERS} from './events.js'
import {Lifecycle} from './lifecycle.js'
import {Providers} from './providers/providers.js'
import {createS3Provider} from './providers/s3.js'
import {QuotaState} from './quotaState.js'
import {createRoutes} from './routes.js'
import {Usage} from './usage.js'
import {UsageRepository} from './usageRepository.js'

configureServer(logConfig)

const log = getLogger('main')

const main = async () => {
    const db = await initializeDb()
    const attachments = new Attachments({bucket: s3.bucket})
    const providers = new Providers({s3: await createS3Provider(s3)})
    const repository = new UsageRepository(db, () => new Date())
    const usage = new Usage({
        repository,
        attachments,
        providers,
        events: {emitUserDataSize}
    })
    const quotaState = new QuotaState()
    const lifecycle = new Lifecycle({attachments, providers, usage, repository})
    const access = new Access({attachments, providers, quotaState, usage, sepalHost})
    await initMessageQueue(amqpUri, {
        publishers: USER_DATA_PUBLISHERS,
        subscribers: [
            {queue: 'user-data.budgetExceeded', topic: 'budget.UserBudgetExceeded', handler: (_key, message) => quotaState.onExceeded(message)},
            {queue: 'user-data.budgetCleared', topic: 'budget.UserBudgetCleared', handler: (_key, message) => quotaState.onCleared(message)},
            {queue: 'user-data.userStorageErased', topic: 'storage.UserStorageErased', handler: (_key, message) => lifecycle.onUserStorageErased(message)}
        ]
    })
    usage.start()
    lifecycle.start()
    const browser = new DataBrowser({attachments, providers, usage})
    const browserWs$ = moduleWs$(createBrowserWs({browser}))
    await server.start({
        port,
        routes: createRoutes(access, browser, usage),
        wsRoutes: {'/ws': server.wsStream(ctx => browserWs$(ctx.arg$))}
    })
    log.info('Initialized')
}

main().catch(error => {
    log.fatal(error)
    process.exit(1)
})

import {Subject} from 'rxjs'

import logConfig from '#config/log.json' with {type: 'json'}
import * as server from '#sepal/httpServer'
import {configureServer, getLogger} from '#sepal/log'
import {initMessageQueue} from '#sepal/messageQueue'

import {createBudgetApi} from './budgetApi.js'
import {createBudgetManager} from './budgetManager.js'
import {createBudgetRepository} from './budgetRepository.js'
import {amqpUri, config} from './config.js'
import {getPool, initializeDatabase} from './db.js'
import {createEnforcement} from './enforcement.js'
import * as budgetEvents from './events.js'
import {createBudgetComponent} from './index.js'
import {createOpenSessionUse} from './openSessionUse.js'
import {createPricing} from './pricing.js'
import {createReconciler} from './reconciler.js'
import {registerBudgetRoutes} from './routes.js'
import {createSeed} from './seed.js'
import {createSessionEventHandlers} from './sessionEventHandlers.js'
import {createUserClient} from './userClient.js'
import {createWorkerClient} from './workerClient.js'
import {createBudgetWs} from './ws.js'

configureServer(logConfig)

const log = getLogger('main')

let component = null

const main = async () => {
    await initializeDatabase()

    const pricing = createPricing()
    const userClient = createUserClient(config)
    const workerClient = createWorkerClient()

    const repo = createBudgetRepository()
    const budgetManager = createBudgetManager({repo, pricing, userClient, events: budgetEvents})

    const openSessionUse = createOpenSessionUse(getPool)
    const handlers = createSessionEventHandlers({
        openSessionUse,
        budgetCommands: budgetManager.commands,
        onStorageUpdated: username => budgetManager.commands.updateUserSpendingReport(username),
    })

    const enforcement = createEnforcement({budgetManager, userClient, events: budgetEvents})
    const reconciler = createReconciler({workerClient, openSessionUse, pool: getPool})

    // A seed failure must not crash boot: the hourly reconciler heals open_session_use once the
    // worker is reachable.
    const seed = createSeed({workerClient, openSessionUse, pool: getPool})
    try {
        await seed()
    } catch (error) {
        log.warn('Seed failed; open_session_use will self-heal via the hourly reconciler', error)
    }

    const spending$ = new Subject()
    component = createBudgetComponent({budgetManager, handlers, enforcement, reconciler, spending$})
    const budgetApi = createBudgetApi({budgetManager, publishSpending: component.publishSpending})
    const budgetWs$ = createBudgetWs({budgetManager, spending$})

    await initMessageQueue(amqpUri, {
        publishers: [...budgetEvents.BUDGET_PUBLISHERS],
        subscribers: component.subscribers,
    })

    component.start()

    await server.start({
        port: config.port,
        routes: router => {
            router.get('/healthcheck', ctx => {
                ctx.body = {status: 'ok'}
            })
            return registerBudgetRoutes(router, budgetApi)
        },
        wsRoutes: {
            '/ws': server.wsStream(ctx => budgetWs$(ctx.arg$)),
        },
    })

    log.info('Initialized')
}

const stop = async () => {
    if (component) {
        try {
            component.stop()
        } catch (error) {
            log.error('Error stopping budget component', error)
        }
    }
    process.exit(0)
}

process.once('SIGTERM', stop)
process.once('SIGINT', stop)

main().catch(error => {
    log.error('Fatal', error)
    process.exit(1)
})

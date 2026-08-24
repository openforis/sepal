import {getLogger} from '#sepal/log'

import {BUDGET_PUBLISHERS} from './events.js'

const log = getLogger('sepal.budget')

const HOUR_MS = 60 * 60 * 1000

const scheduleFixedDelay = (name, fn, intervalMs) => {
    const run = () =>
        Promise.resolve()
            .then(fn)
            .catch(error => log.error(`Scheduled job ${name} failed`, error))
    run() // initial delay 0
    return setInterval(run, intervalMs)
}

const createBudgetComponent = ({budgetManager, handlers, enforcement, reconciler, spending$ = null}) => {
    const commands = budgetManager.commands

    let timers = []

    const publishSpending = async username => {
        if (!spending$ || username == null) {
            return
        }
        try {
            spending$.next({username, spending: await budgetManager.userSpending(username)})
        } catch (error) {
            log.error(`Failed to publish spending for ${username}`, error)
        }
    }

    const publishSpendingReport = async () => {
        if (!spending$) {
            return
        }
        try {
            const report = await commands.loadSpendingReport()
            for (const [username, entry] of Object.entries(report)) {
                spending$.next({username, spending: budgetManager.asSpending(entry)})
            }
        } catch (error) {
            log.error('Failed to publish the spending report', error)
        }
    }

    // All user_spending writers are serialized through this promise chain, so the hourly DELETE-all +
    // INSERT rebuild never interleaves with a per-user UPDATE.
    let writerChain = Promise.resolve()
    const serialize = fn => {
        const run = writerChain.then(fn, fn) // continue the chain regardless of prior outcome
        writerChain = run.catch(() => {})
        return run
    }

    const start = () => {
        log.info('budget component starting')

        timers.push(scheduleFixedDelay(
            'UpdateSpendingReport',
            async () => {
                await serialize(() => commands.updateSpendingReport())
                await enforcement.publishVerdicts()
                await publishSpendingReport()
            },
            HOUR_MS))

        timers.push(scheduleFixedDelay(
            'ReconcileOpenSessions',
            () => reconciler.reconcile(),
            HOUR_MS))

        log.info('budget component started')
    }

    const stop = () => {
        log.info('budget component stopping')
        timers.forEach(clearInterval)
        timers = []
        log.info('budget component stopped')
    }

    const workerSessionRequestedSubscriber = {
        queue: 'budget.workerSessionRequested',
        topic: 'workerSession.WorkerSessionRequested',
        handler: async (key, message) => {
            await handlers.onWorkerSessionRequested(message)
            await publishSpending(message.username)
        },
    }

    const workerSessionActivatedSubscriber = {
        queue: 'budget.workerSessionActivated',
        topic: 'workerSession.WorkerSessionActivated',
        handler: async (key, message) => {
            await handlers.onWorkerSessionActivated(message)
            await publishSpending(message.username)
        },
    }

    const workerSessionClosedSubscriber = {
        queue: 'budget.workerSessionClosed',
        topic: 'workerSession.WorkerSessionClosed',
        handler: async (key, message) => {
            await handlers.onWorkerSessionClosed(message)
            await publishSpending(message.username)
        },
    }

    const userStorageSubscriber = {
        queue: 'budget.userStorage',
        topic: 'userStorage.size',
        handler: async (key, message) => {
            await serialize(() => handlers.onUserStorageSize(message))
            await publishSpending(message.username)
        },
    }

    return {
        start,
        stop,
        subscribers: [
            workerSessionRequestedSubscriber,
            workerSessionActivatedSubscriber,
            workerSessionClosedSubscriber,
            userStorageSubscriber,
        ],
        publishSpending,
        BUDGET_PUBLISHERS,
    }
}

export {createBudgetComponent}

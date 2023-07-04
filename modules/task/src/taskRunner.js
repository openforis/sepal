const {BehaviorSubject, concat, of, throwError, catchError, distinctUntilChanged, first, map, takeUntil, tap} = require('rxjs')
const {finalizeObservable$} = require('#sepal/rxjs')
const {job} = require('#task/jobs/job')
const log = require('#sepal/log').getLogger('task')
const _ = require('lodash')

const {contextService} = require('#task/jobs/service/context')
const {exportLimiterService} = require('#task/jobs/service/exportLimiter')
const {driveLimiterService} = require('#task/jobs/service/driveLimiter')
const {driveSerializerService} = require('#task/jobs/service/driveSerializer')
const {gcsSerializerService} = require('#task/jobs/service/gcsSerializer')

const tasks = {
    'image.asset_export': () => require('./tasks/imageAssetExport'),
    'image.sepal_export': () => require('./tasks/imageSepalExport'),
    'timeseries.download': () => require('./tasks/timeSeriesSepalExport'),
    'ccdc.asset_export': () => require('./tasks/ccdcAssetExport')
}

const {tag} = require('#sepal/tag')

const taskTag = id => tag('Task', id)

const msg = (id, msg) => `${taskTag, id}: ${msg}`

const executeTask$ = ({id, name, params}, {cmd$}) => {
    const cancel$ = cmd$

    const getTask = (id, name) => {
        const task = tasks[name]
        if (!task) {
            throw new Error(msg(id, `Doesn't exist: ${name}`))
        }
        return task()
    }
    
    log.info(msg(id, `submitting ${name}`))
    
    const task = getTask(id, name)

    const initialState = {
        state: 'ACTIVE',
        defaultMessage: 'Executing...',
        messageKey: 'tasks.status.executing'
    }

    const cancelState = {
        state: 'CANCELED',
        defaultMessage: 'Canceled!',
        messageKey: 'tasks.status.canceled'
    }

    const completedState = {
        state: 'COMPLETED',
        defaultMessage: 'Completed!',
        messageKey: 'tasks.status.completed'
    }

    const progressState$ = task.submit$(id, params).pipe(
        distinctUntilChanged((p1, p2) => _.isEqual(
            _.pick(p1, ['defaultMessage', 'messageKey', 'messageArgs']),
            _.pick(p2, ['defaultMessage', 'messageKey', 'messageArgs'])
        )),
        map(progress => {
            if (!progress.defaultMessage || !progress.messageKey) {
                log.warn(msg(id, `Malformed progress. Must contain 'defaultMessage' and 'messageKey' properties: ${JSON.stringify(progress)}`))
                progress = {
                    defaultMessage: 'Executing...',
                    messageKey: 'tasks.status.executing'
                }
            }
            log.info(msg(id, progress.defaultMessage))
            return progress
        })
    )

    const finalState$ = new BehaviorSubject(completedState)

    return concat(
        of(initialState),
        progressState$.pipe(
            takeUntil(cancel$.pipe(
                tap(() => finalState$.next(cancelState))
            )),
            catchError(e =>
                concat(
                    finalizeObservable$(id),
                    throwError(() => e)
                )
            )
        ),
        finalizeObservable$(id),
        finalState$.pipe(first())
    )
}

// Execute in main-thread
// module.exports = executeTask$

// Execute in worker
module.exports = job({
    jobName: 'execute task',
    jobPath: __filename,
    before: [require('#task/jobs/configure'), require('#task/jobs/ee/initialize')],
    services: [contextService, exportLimiterService, driveLimiterService, driveSerializerService, gcsSerializerService],
    args: ({task}) => [task],
    worker$: executeTask$
})

import {BehaviorSubject, concat, of, throwError, catchError, distinctUntilChanged, first, map, takeUntil, tap} from 'rxjs'
import {finalizeObservable$} from '#sepal/rxjs'
import {job} from '#task/jobs/job'
import {getLogger} from '#sepal/log'
import _ from 'lodash'
import {contextService} from '#task/jobs/service/context'
import {exportLimiterService} from '#task/jobs/service/exportLimiter'
import {driveLimiterService} from '#task/jobs/service/driveLimiter'
import {driveSerializerService} from '#task/jobs/service/driveSerializer'
import {gcsSerializerService} from '#task/jobs/service/gcsSerializer'
import {tag} from '#sepal/tag'
import {createRequire} from 'module'
import {fileURLToPath} from 'url'

// Lazy task/job loading (require(esm)) defers loading and breaks cycles.
const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)

const log = getLogger('task')


const tasks = {
    'image.GEE': () => require('./tasks/imageAssetExport'),
    'image.SEPAL': () => require('./tasks/imageSepalExport'),
    'image.DRIVE': () => require('./tasks/imageDriveExport'),
    'timeseries.download': () => require('./tasks/timeSeriesSepalExport'),
    'ccdc.GEE': () => require('./tasks/ccdcAssetExport')
}


const taskTag = id => tag('Task', id)

const msg = (id, msg) => `${taskTag(id)}: ${msg}`

const worker$ = ({
    task: {id, name, params},
    cmd$
}) => {
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
export default job({
    jobName: 'execute task',
    jobPath: __filename,
    before: [require('#task/jobs/configure').default, require('#task/jobs/ee/initialize').default],
    services: [contextService, exportLimiterService, driveLimiterService, driveSerializerService, gcsSerializerService],
    args: ({task}) => ({task}),
    worker$
})

const {concat, of} = require('rx')
const {distinctUntilChanged, map} = require('rx/operators')
const log = require('sepal/log').getLogger('task')
const _ = require('lodash')

const tasks = {
    'image.asset_export': () => require('./tasks/imageAssetExport'),
    'image.sepal_export': () => require('./tasks/imageSepalExport'),
    'timeseries.download': () => require('./tasks/timeSeriesSepalExport')
}

const msg = (id, msg) => `Task ${id.substr(-4)}: ${msg}`

const executeTask$ = ({id, name, params}) => {

    const getTask = (id, name) => {
        const task = tasks[name]
        if (!task) {
            throw new Error(msg(id, `Doesn't exist: ${name}`))
        }
        return task()
    }
    
    log.info(msg(id, `submitting ${name}`))
    
    const task = getTask(id, name)

    const initialState$ = of({
        state: 'ACTIVE',
        defaultMessage: 'Executing...',
        messageKey: 'tasks.status.executing'
    })

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

    const finalState$ = of({
        state: 'COMPLETED',
        defaultMessage: 'Completed!',
        messageKey: 'tasks.status.completed'
    })

    return concat(
        initialState$,
        progressState$,
        finalState$
    )
}

// Execute in main-thread
// module.exports = executeTask$

// Execute in worker
module.exports = require('root/jobs/job')({
    jobName: 'execute task',
    jobPath: __filename,
    initArgs: () => ({config: require('root/config')}),
    before: [require('root/jobs/setConfig'), require('root/jobs/ee/initialize')],
    services: [require('./driveLimiter').limiter, require('root/ee/export/serializer').limiter, require('root/ee/export/limiter').limiter],
    args: ctx => [ctx],
    worker$: executeTask$
})

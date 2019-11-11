const {Subject, of} = require('rxjs')
const {first, groupBy, mergeMap, tap, map, share, filter} = require('rxjs/operators')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const log = require('../log')
const {initWorker$} = require('./factory')

const workerPool = {}
const workerRequest$ = new Subject()
const workerResponse$ = new Subject()

const GROUP_CONCURRENCY = 2

const releaseWorkerInstance = (jobName, id) => {
    const workerInstance = _.find(workerPool[jobName], workerInstance => workerInstance.id === id)
    if (workerInstance) {
        workerInstance.locked = false
    }
}

const createWorkerInstance = (jobName, worker) => {
    const workerInstance = {
        worker,
        id: uuid(),
        locked: true
    }
    workerPool[jobName] = [...(workerPool[jobName] || []), workerInstance]
    return workerInstance
}

const startNewWorkerInstance$ = (jobName, jobPath) =>
    initWorker$(jobName, jobPath).pipe(
        map(worker => createWorkerInstance(jobName, worker)),
        tap(workerInstance => log.trace(`Job: using cold worker <${jobName}.${workerInstance.id}>`))
    )

const getUnlockedWorkerInstance = jobName =>
    _.find(workerPool[jobName], workerInstance => !workerInstance.locked)

const getWorkerInstance$ = (jobName, jobPath) => {
    const workerInstance = getUnlockedWorkerInstance(jobName)
    if (workerInstance) {
        workerInstance.locked = true
        log.trace(`Job: using hot worker <${jobName}.${workerInstance.id}>`)
        return of(workerInstance)
    }
    return startNewWorkerInstance$(jobName, jobPath)
}

const submitRequest = ({requestId, jobName, jobPath, args}) =>
    workerRequest$.next({requestId, jobName, jobPath, args})

const getResponse$ = requestId =>
    workerResponse$.pipe(
        share(),
        filter(response => response.requestId === requestId),
        map(({result}) => result),
        first()
    )

const submit$ = (jobName, jobPath, args) => {
    log.trace(`Submitting <${jobName}> to pooled worker`)
    const requestId = uuid()
    submitRequest({requestId, jobName, jobPath, args})
    return getResponse$(requestId)
}

workerRequest$.pipe(
    groupBy(({jobName}) => jobName),
    mergeMap(group =>
        group.pipe(
            mergeMap(({requestId, jobName, jobPath, args}) =>
                getWorkerInstance$(jobName, jobPath).pipe(
                    mergeMap(({worker, id}) =>
                        worker.submit$(args).pipe(
                            map(result => ({
                                requestId,
                                result
                            })),
                            tap(() => releaseWorkerInstance(jobName, id))
                        ))
                ), null, GROUP_CONCURRENCY
            )
        )
    )
).subscribe(
    response => workerResponse$.next(response)
)

module.exports = {
    submit$
}

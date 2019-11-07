const {Subject, ReplaySubject, of, defer} = require('rxjs')
const {first, groupBy, mergeMap} = require('rxjs/operators')
const _ = require('lodash')
const log = require('../log')

const {startWorker} = require('./manager')

const workerPool = {}
const workerRequest$ = new Subject()

const releaseWorkerInstance = (jobName, id) => {
    const workerInstance = _.find(workerPool[jobName], workerInstance => workerInstance.worker.id === id)
    workerInstance.locked = false
}

const startNewWorkerInstance = (jobName, jobPath) => {
    const worker = startWorker(jobName, jobPath)
    const workerInstance = {
        worker,
        locked: true
    }
    workerPool[jobName] = [...(workerPool[jobName] || []), workerInstance]
    log.trace(`Job: using cold worker <${jobName}.${workerInstance.worker.id}>`)
    return workerInstance
}

const getWorkerInstanceFromPool = jobName => {
    const workerInstance = _.find(workerPool[jobName], workerInstance => !workerInstance.locked)
    if (workerInstance) {
        workerInstance.locked = true
        log.trace(`Job: using hot worker <${jobName}.${workerInstance.worker.id}>`)
    }
    return workerInstance
}

const getOrCreateWorkerInstance = (jobName, jobPath) =>
    getWorkerInstanceFromPool(jobName) || startNewWorkerInstance(jobName, jobPath)
    // startNewWorkerInstance(jobName, jobPath)

const getWorker$ = (jobName, jobPath) => {
    const worker$ = new ReplaySubject()
    workerRequest$.next({worker$, jobName, jobPath})
    return worker$.pipe(
        first()
    )
}

workerRequest$.pipe(
    groupBy(({jobName}) => jobName),
    mergeMap(group =>
        group.pipe(
            mergeMap(({worker$, jobName, jobPath}) =>
                defer(() =>
                    of({
                        worker$,
                        worker: getOrCreateWorkerInstance(jobName, jobPath).worker
                    })
                )
            )
        ), null, 1
    )
).subscribe(
    ({worker$, worker}) => worker$.next(worker)
)

module.exports = {
    getWorker$
}

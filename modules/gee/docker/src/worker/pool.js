const {Subject, ReplaySubject, of, defer} = require('rxjs')
const {first, groupBy, mergeMap, switchMap, finalize} = require('rxjs/operators')
const _ = require('lodash')
const log = require('../log')
const {initWorker} = require('./manager')

const workerPool = {}
const workerRequest$ = new Subject()

const releaseWorkerInstance = (jobName, id) => {
    const workerInstance = _.find(workerPool[jobName], workerInstance => workerInstance.worker.id === id)
    if (workerInstance) {
        workerInstance.locked = false
    }
}

const startNewWorkerInstance = (jobName, jobPath) => {
    const worker = initWorker(jobName, jobPath)
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

const submit$ = (jobName, jobPath, args) => {
    log.trace(`Submitting <${jobName}> to pooled worker`)
    const worker$ = new ReplaySubject()
    workerRequest$.next({worker$, jobName, jobPath})
    return worker$.pipe(
        first(),
        switchMap(({id, submit$, dispose}) =>
            submit$(args).pipe(
                finalize(() => releaseWorkerInstance(jobName, id))
            )
        )
    )
}

module.exports = {
    submit$
}

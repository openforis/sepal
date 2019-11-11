const {Subject} = require('rxjs')
const {first, groupBy, mergeMap, tap, map, share, filter} = require('rxjs/operators')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const log = require('@sepal/log')
const {initWorker$} = require('./factory')
const Pool = require('./pool')

const workerRequest$ = new Subject()
const workerResponse$ = new Subject()

const GROUP_CONCURRENCY = 2

const workerPool = Pool({
    create$: ({jobName, jobPath}) => initWorker$(jobName, jobPath),
    onCold: (jobName, id) => log.trace(`Job: using cold worker <${jobName}.${id}>`),
    onHot: (jobName, id) => log.trace(`Job: using hot worker <${jobName}.${id}>`)
})

const getWorkerInstance$ = (jobName, jobPath) =>
    workerPool.get$(jobName, {jobName, jobPath}).pipe(
        map(({item: worker, release}) => ({worker, release}))
    )

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
                    mergeMap(({worker, release}) =>
                        worker.submit$(args).pipe(
                            map(result => ({
                                requestId,
                                result
                            })),
                            tap(() => release())
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

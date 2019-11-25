const {Subject} = require('rxjs')
const {groupBy, mergeMap, tap, map, share, filter, finalize, takeUntil} = require('rxjs/operators')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const log = require('@sepal/log')
const {initWorker$} = require('./factory')
const Pool = require('./pool')

const pooledWorker = concurrency => {
    const workerRequest$ = new Subject()
    const workerResponse$ = new Subject()
    const cancel$ = new Subject()

    const workerPool = Pool({
        create$: ({jobId, jobPath}) => initWorker$(jobId, jobPath),
        onCold: ({jobId}) => log.debug(`Creating worker <${jobId}>`),
        onHot: ({jobId}) => log.debug(`Recycling worker <${jobId}>`),
        onRelease: ({jobId}) => log.trace(`Released worker <${jobId}>`)
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
            map(({result}) => result)
        )
    
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
                                takeUntil(cancel$.pipe(
                                    filter(cancel => cancel.requestId === requestId)
                                )),
                                tap(() => release())
                            ))
                    ), null, concurrency
                ),
            )
        )
    ).subscribe(
        response => workerResponse$.next(response)
    )

    return {
        submit$(jobName, jobPath, args) {
            log.trace(`Submitting <${jobName}> to pooled worker`)
            const requestId = uuid()
            submitRequest({requestId, jobName, jobPath, args})
            return getResponse$(requestId).pipe(
                finalize(() => cancel$.next({requestId}))
            )
        }
    }
}

module.exports = pooledWorker

const {Subject} = require('rxjs')
const {groupBy, mergeMap, map, share, filter, finalize, takeUntil} = require('rxjs/operators')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const log = require('@sepal/log')
const {initWorker$} = require('./factory')
const Pool = require('./pool')

const PooledWorker = ({concurrency = 10, defaultMinIdleCount = 0, defaultMaxIdleMilliseconds = 0}) => {
    const workerRequest$ = new Subject()
    const workerResponse$ = new Subject()
    const cancel$ = new Subject()

    const pools = {}

    const createPool = ({jobName, jobPath, minIdleCount = defaultMinIdleCount, maxIdleMilliseconds = defaultMaxIdleMilliseconds}) =>
        Pool({
            name: jobName,
            create$: instanceId => initWorker$(instanceId, jobPath),
            onDispose: ({item}) => item.dispose(),
            maxIdleMilliseconds,
            minIdleCount
        })
        
    const getPool = ({jobName, jobPath, minIdleCount, maxIdleMilliseconds}) => {
        if (!pools[jobName]) {
            pools[jobName] = createPool({jobName, jobPath, minIdleCount, maxIdleMilliseconds})
        }
        return pools[jobName]
    }

    const getWorkerInstance$ = ({jobName, jobPath, minIdleCount, maxIdleMilliseconds}) =>
        getPool({jobName, jobPath, minIdleCount, maxIdleMilliseconds}).get$().pipe(
            map(({item: worker, release}) => ({worker, release}))
        )
    
    const submitRequest = ({requestId, jobName, jobPath, minIdleCount, maxIdleMilliseconds, args, args$}) =>
        workerRequest$.next({requestId, jobName, jobPath, minIdleCount, maxIdleMilliseconds, args, args$})
    
    const getResponse$ = requestId =>
        workerResponse$.pipe(
            share(),
            filter(({requestId: currentRequestId}) => currentRequestId === requestId),
            map(({result}) => result)
        )
    
    workerRequest$.pipe(
        groupBy(({jobName}) => jobName),
        mergeMap(group =>
            group.pipe(
                mergeMap(({requestId, jobName, jobPath, minIdleCount, maxIdleMilliseconds, args, args$}) =>
                    getWorkerInstance$({jobName, jobPath, minIdleCount, maxIdleMilliseconds}).pipe(
                        mergeMap(({worker, release}) =>
                            worker.submit$(args, args$).pipe(
                                map(result => ({
                                    requestId,
                                    result
                                })),
                                takeUntil(cancel$.pipe(
                                    filter(({requestId: currentRequestId}) => currentRequestId === requestId),
                                )),
                                finalize(() => release())
                            )
                        )
                    ), null, concurrency
                ),
            )
        )
    ).subscribe(
        response => workerResponse$.next(response)
    )

    return {
        submit$({jobName, jobPath, minIdleCount, maxIdleMilliseconds, args, args$}) {
            log.trace(`Submitting <${jobName}> to pooled worker`)
            const requestId = uuid()
            submitRequest({requestId, jobName, jobPath, minIdleCount, maxIdleMilliseconds, args, args$})
            return getResponse$(requestId).pipe(
                finalize(() => cancel$.next({requestId}))
            )
        }
    }
}

module.exports = PooledWorker

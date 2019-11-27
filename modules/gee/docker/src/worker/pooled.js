const {Subject} = require('rxjs')
const {groupBy, mergeMap, map, share, filter, finalize, takeUntil} = require('rxjs/operators')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const log = require('@sepal/log')
const {initWorker$} = require('./factory')
const Pool = require('./pool')

const PooledWorker = ({concurrency, maxIdleMilliseconds}) => {
    const workerRequest$ = new Subject()
    const workerResponse$ = new Subject()
    const cancel$ = new Subject()

    const pools = {}

    const getWorkerInstance$ = ({jobName, jobPath, minIdleCount}) => {
        if (!pools[jobName]) {
            const pool = Pool({
                name: jobName,
                create$: instanceId => initWorker$(instanceId, jobPath),
                onCold: ({instanceId}) => log.debug(`Creating worker <${instanceId}>`),
                onHot: ({instanceId}) => log.debug(`Recycling worker <${instanceId}>`),
                onRelease: ({instanceId}) => log.trace(`Released worker <${instanceId}>`),
                onDispose: ({instanceId, item}) => {
                    item.dispose()
                    log.debug(`Disposed worker <${instanceId}>`)
                },
                maxIdleMilliseconds,
                minIdleCount
            })
            pools[jobName] = pool
        }

        return pools[jobName].get$().pipe(
            map(({item: worker, release}) => ({worker, release}))
        )
    }
    
    const submitRequest = ({requestId, jobName, jobPath, minIdleCount, args, args$}) =>
        workerRequest$.next({requestId, jobName, jobPath, minIdleCount, args, args$})
    
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
                mergeMap(({requestId, jobName, jobPath, minIdleCount, args, args$}) =>
                    getWorkerInstance$({jobName, jobPath, minIdleCount}).pipe(
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
        submit$({jobName, jobPath, minIdleCount, args, args$}) {
            log.trace(`Submitting <${jobName}> to pooled worker`)
            const requestId = uuid()
            submitRequest({requestId, jobName, jobPath, minIdleCount, args, args$})
            return getResponse$(requestId).pipe(
                finalize(() => cancel$.next({requestId}))
            )
        }
    }
}

module.exports = PooledWorker

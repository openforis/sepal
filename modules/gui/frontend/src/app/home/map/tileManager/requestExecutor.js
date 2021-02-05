import {ReplaySubject} from 'rxjs'
import {finalize, first, takeUntil, tap} from 'rxjs/operators'
import {requestTag} from './tag'

export const getRequestExecutor = concurrency => {
    const requestHandlers = {}
    const executed$ = new ReplaySubject()

    const count = () => {
        return Object.keys(requestHandlers).length
    }
    
    const available = () => {
        return count() < concurrency
    }
    
    const start = ({tileProviderId, requestId, request, response$, cancel$}) => {
        const requestHandler = {tileProviderId, request, response$, cancel$, timestamp: Date.now()}
        requestHandlers[requestId] = requestHandler
        console.log(`Started ${requestTag({tileProviderId, requestId})}, now ${count()}`)
    }
    
    const finish = ({tileProviderId, requestId}) => {
        delete requestHandlers[requestId]
        console.log(`Finished ${requestTag({tileProviderId, requestId})}, now ${count()}`)
    }

    const execute = ({tileProvider, tileProviderId, requestId, request, response$, cancel$}) => {
        start({tileProviderId, requestId, request, response$, cancel$})
        tileProvider.loadTile$(request).pipe(
            first(),
            takeUntil(cancel$.pipe(
                tap(`Cancelled ${requestTag({tileProviderId, requestId})}`)
            )),
            finalize(() => {
                finish({tileProviderId, requestId})
                executed$.next({tileProviderId, requestId})
            })
        ).subscribe({
            next: response => {
                console.log(`Succeeded ${requestTag({tileProviderId, requestId})}`)
                response$.next(response)
                response$.complete()
            },
            error: error => {
                console.error(`Failed ${requestTag({tileProviderId, requestId})}`, error)
                response$.error(error)
            }
        })
    }
    
    return {available, execute, executed$}
}

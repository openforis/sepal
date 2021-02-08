import {ReplaySubject} from 'rxjs'
import {finalize, first, takeUntil, tap} from 'rxjs/operators'
import {requestTag} from './tag'

export const getRequestExecutor = concurrency => {
    const requestHandlers = {}
    const started$ = new ReplaySubject()
    const finished$ = new ReplaySubject()

    const count = () => {
        return Object.keys(requestHandlers).length
    }
    
    const available = () => {
        return count() < concurrency
    }
    
    const start = ({tileProviderId, requestId, request, response$, cancel$}) => {
        const requestHandler = {tileProviderId, request, response$, cancel$, timestamp: Date.now()}
        requestHandlers[requestId] = requestHandler
        started$.next(tileProviderId)
        console.log(`Started ${requestTag({tileProviderId, requestId})}, active: ${count()}`)
    }
    
    const finish = ({tileProviderId, requestId}) => {
        delete requestHandlers[requestId]
        finished$.next(tileProviderId)
        console.log(`Finished ${requestTag({tileProviderId, requestId})}, active: ${count()}`)
    }

    const execute = ({tileProvider, tileProviderId, requestId, request, response$, cancel$}) => {
        start({tileProviderId, requestId, request, response$, cancel$})
        tileProvider.loadTile$(request).pipe(
            first(),
            takeUntil(cancel$.pipe(
                tap(() => console.log(`Cancelled ${requestTag({tileProviderId, requestId})}`))
            )),
            finalize(() =>
                finish({tileProviderId, requestId})
            ),
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
    
    return {available, execute, started$, finished$}
}

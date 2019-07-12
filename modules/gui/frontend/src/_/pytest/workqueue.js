import {Subject, isObservable, of} from 'rxjs'
import {catchError, concat, delay, filter, map, merge, mergeMap, share, takeUntil, takeWhile, tap} from 'rxjs/operators'
import {onUnsubscribe} from './operators'

export class WorkQueue {
    constructor({concurrency, delaySeconds = 0, description}) {
        this.requests$ = new Subject()
        this.outputSubject$ = new Subject()
        this.output$ = this.outputSubject$.pipe(share())
        this.description = description
        this.subscription = this.requests$.pipe(
            map(r => r.request),
            merge(concurrency),
            delay(delaySeconds)
        ).subscribe(
            request => this.outputSubject$.next(request),
            error => console.error(`Error in request stream: ${error}`),
            () => console.info('********** COMPLETED **********')
        )
    }

    enqueue({observable$, group = 'some-default-group', description}) {
        console.info(`Enqueue ${description}`)
        const key = Math.random()
        const canceled = new Subject()
        let error = undefined

        const logStatus = status => console.info({group, key, status})

        const handleError = e => {
            logStatus('FAILED')
            error = e
            return of({key, error})
        }

        const throwIfError = request => {
            if (error) {
                throw Error(error)
            } else {
                return of(request)
            }
        }

        const extractValue = value =>
            isObservable(value)
                ? value
                : of(value)

        const cancelRequest = () => {
            canceled.next(true)
            console.info(`*** Cancelling ${description}`)
        }

        logStatus('ENQUEUED')

        const request = of(true).pipe(
            tap(() => logStatus('STARTED')),
            mergeMap(() =>
                observable$.pipe(
                    mergeMap(extractValue),
                    tap(value => console.info(`Inner value: ${value}`)),
                    map(value => ({key, value})),
                    // retry with backoff
                    catchError(e => handleError(e)),
                    takeUntil(canceled)
                )
            ),
            concat(of({key, complete: true}).pipe(
                tap(() => logStatus('COMPLETED'))
            ))
        )

        this.requests$.next({request})

        return this.output$.pipe(
            filter(request => request.key === key),
            mergeMap(request => throwIfError(request)),
            takeWhile(request => !request.complete),
            mergeMap(request => of(request.value)),
            onUnsubscribe(cancelRequest)
        )
    }

    dispose() {
        this.subscription && this.subscription.unsubscribe()
    }
}

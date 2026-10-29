import {catchError, EMPTY, finalize, groupBy, map, mergeMap, ReplaySubject, Subject, take, takeUntil} from 'rxjs'

import {getLogger} from '#sepal/log'

const log = getLogger('limiter')

const Limiter = ({name, concurrency}) => {
    const request$ = new Subject()

    request$.pipe(
        groupBy(({key}) => key),
        mergeMap(group$ => group$.pipe(
            mergeMap(
                ({task$, response$, abort$}) => task$().pipe(
                    map(response => ({response$, response})),
                    catchError(error => {
                        response$.error(error)
                        return EMPTY
                    }),
                    finalize(() => response$.complete()),
                    takeUntil(abort$)
                ),
                concurrency
            )
        )),
        catchError(error => log.error(`Unexpected ${name} limiter error:`, error))
    ).subscribe({
        next: ({response$, response}) => response$.next(response),
        error: error => log.error(`Unexpected ${name} limiter stream error`, error),
        complete: () => log.error(`Unexpected ${name} limiter stream complete`)
    })
    
    return (task$, key) => {
        const response$ = new ReplaySubject(1)
        const abort$ = new Subject()
        request$.next({task$, response$, abort$, key})
        return response$.pipe(
            take(1),
            finalize(() => abort$.next(true))
        )
    }
}

export {Limiter}

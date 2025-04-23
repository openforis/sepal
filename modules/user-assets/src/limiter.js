const {Subject, ReplaySubject, groupBy, mergeMap, map, catchError, take, finalize, EMPTY, takeUntil} = require('rxjs')
const log = require('#sepal/log').getLogger('limiter')

const Limiter = ({name, concurrency, group = () => true}) => {
    const request$ = new Subject()

    request$.pipe(
        groupBy(group),
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
    
    return task$ => {
        const response$ = new ReplaySubject(1)
        const abort$ = new Subject()
        request$.next({task$, response$, abort$})
        return response$.pipe(
            take(1),
            finalize(() => abort$.next(true))
        )
    }
}

module.exports = {Limiter}

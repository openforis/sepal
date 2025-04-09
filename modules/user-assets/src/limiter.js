const {Subject, ReplaySubject, groupBy, mergeMap, map, catchError, take} = require('rxjs')
const log = require('#sepal/log').getLogger('limiter')

const Limiter = ({name, concurrency, group = () => true}) => {
    const request$ = new Subject()

    request$.pipe(
        groupBy(group),
        mergeMap(group$ => group$.pipe(
            mergeMap(
                ({task$, response$}) => task$().pipe(
                    map(response => ({response$, response})),
                    catchError(error => response$.error(error))
                ),
                concurrency
            )
        ))
    ).subscribe({
        next: ({response$, response}) => response$.next(response),
        error: error => log.error(`Unexpected ${name} limiter stream error`, error),
        complete: () => log.error(`Unexpected ${name} limiter stream complete`)
    })
    
    return task$ => {
        const response$ = new ReplaySubject(1)
        request$.next({task$, response$})
        return response$.pipe(take(1))
    }
}

module.exports = {Limiter}

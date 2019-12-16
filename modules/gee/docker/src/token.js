const {Subject, pipe} = require('rxjs')
const {finalize, takeUntil, switchMap, mergeMap, tap} = require('rxjs/operators')
const service = require('@sepal/worker/service')
const log = require('./log')

const withToken$ = (servicePath, observable$) => {
    const stop$ = new Subject()
    return service.request$(servicePath).pipe(
        tap(token => log.debug('Using token: ', token)),
        mergeMap(token =>
            observable$.pipe(
                finalize(() => {
                    stop$.next()
                    log.debug('Returning token: ', token)
                })
            )
        ),
        takeUntil(stop$)
    )
}

const withToken = (servicePath, func$) =>
    pipe(
        switchMap(
            value => withToken$(servicePath, func$(value))
        )
    )

module.exports = {withToken$, withToken}

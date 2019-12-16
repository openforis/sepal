const {Subject, pipe} = require('rxjs')
const {finalize, takeUntil, switchMap, mergeMap, tap} = require('rxjs/operators')
const service = require('@sepal/worker/service')
const log = require('./log')

const withToken$ = (servicePath, observable$) => {
    const releaseToken$ = new Subject()
    const token$ = service.request$(servicePath)

    const releaseToken = token => {
        releaseToken$.next()
        log.debug('Returning token: ', token)
    }
    
    return token$.pipe(
        tap(token => log.debug('Using token: ', token)),
        mergeMap(token =>
            observable$.pipe(
                finalize(() => releaseToken(token))
            )
        ),
        takeUntil(releaseToken$)
    )
}

const withToken = (servicePath, func$) =>
    pipe(
        switchMap(
            value => withToken$(servicePath, func$(value))
        )
    )

module.exports = {withToken$, withToken}

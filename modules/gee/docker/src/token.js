const {Subject, pipe} = require('rxjs')
const {finalize, takeUntil, switchMap, mergeMap, tap} = require('rxjs/operators')
const {v4: uuid} = require('uuid')
const service = require('@sepal/worker/service')
const log = require('./log')('token')

const withToken$ = (servicePath, observable$) => {
    const releaseToken$ = new Subject()
    const requestId = uuid()

    const token$ = service.request$(servicePath, requestId)
    
    const releaseToken = token => {
        releaseToken$.next()
        log.debug(`Returning token ${token}`)
    }
    
    return token$.pipe(
        tap(token => log.debug(`Using token ${token}`)),
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

const {pipe, from} = require('rxjs')
const {finalize, switchMap, mergeMap, tap} = require('rxjs/operators')
const service = require('@sepal/worker/service')
const log = require('./log')

const releaseToken = token =>
    service.request$('token', {release: token}).pipe(
        tap(token => log.warn('released token', token)),
    ).subscribe()

const withToken$ = (namespace, observable$) =>
    service.request$('token', {get: namespace}).pipe(
        tap(token => log.warn('got token', token)),
        mergeMap(token => from(observable$).pipe(
            finalize(() => releaseToken(token))
        ))
    )

const withToken = (namespace, func$) =>
    pipe(
        switchMap(
            value => withToken$(namespace, func$(value))
        )
    )

module.exports = {withToken$, withToken}

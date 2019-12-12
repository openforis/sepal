const {pipe} = require('rxjs')
const {finalize, switchMap, mergeMap} = require('rxjs/operators')
const service = require('@sepal/worker/service')
// const log = require('./log')

const releaseToken = token =>
    service.request$('token', {release: token})
        .subscribe()

const withToken$ = (namespace, observable$) =>
    service.request$('token', {get: namespace}).pipe(
        mergeMap(token => observable$.pipe(
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

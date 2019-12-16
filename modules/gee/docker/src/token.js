const {pipe} = require('rxjs')
const {finalize, switchMap, mergeMap, tap} = require('rxjs/operators')
const service = require('@sepal/worker/service')
const log = require('./log')

const withToken$ = (namespace, observable$) =>
    service.request$('token').pipe(
        tap(token => log.warn('DOING SOMETHING WITH TOKEN', token)),
        mergeMap(() => observable$),
        finalize(() => log.warn('DONE WITH TOKEN'))
    )

const withToken = (namespace, func$) =>
    pipe(
        switchMap(
            value => withToken$(namespace, func$(value))
        )
    )

module.exports = {withToken$, withToken}

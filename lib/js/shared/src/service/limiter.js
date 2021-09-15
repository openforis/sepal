const {Subject} = require('rxjs')
const {finalize, mergeMap, takeUntil} = require('rxjs/operators')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const {TokenLimiter$} = require('sepal/tokenLimiter')
const service = require('sepal/service')

const Limiter = options => {
    const limiter = {
        name: options.name,
        service$: TokenLimiter$(options)
    }

    return {
        limiter,
        limiter$: (observable$, id = uuid().substr(-4)) => {
            const stop$ = new Subject()
            return service.submit$(limiter, id).pipe(
                takeUntil(stop$),
                mergeMap(() => observable$.pipe(
                    finalize(() => stop$.next())
                ))
            )
        }
    }
}

module.exports = {Limiter}

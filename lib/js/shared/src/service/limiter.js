const {Subject} = require('rxjs')
const {finalize, mergeMap, takeUntil} = require('rxjs/operators')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const log = require('sepal/log')('limiter')
const {Limiter$} = require('sepal/limiter')
const service = require('sepal/service')

const Limiter = options => {
    const limiter = {
        name: options.name,
        service$: Limiter$(options)
    }

    return {
        limiter,
        limiter$: observable$ => {
            const stop$ = new Subject()
            return service.submit$(limiter, uuid()).pipe(
                takeUntil(stop$),
                mergeMap(() => observable$.pipe(
                    finalize(() => stop$.next())
                )),
                finalize(() => log.warn('withLimiter finalize'))
            )
        }
    }
}

module.exports = {Limiter}

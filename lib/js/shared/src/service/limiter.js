const {Subject, ReplaySubject, defer, zip, concat, of} = require('rxjs')
const {first, map, filter, delay, finalize, tap, mapTo, mergeMap} = require('rxjs/operators')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const log = require('sepal/log')('limiter')
const service = require('sepal/service')

const Limiter$ = ({name, rateWindowMs = 1000, maxRate, maxConcurrency}) => {
    const requestId$ = new Subject()
    const rateToken$ = new Subject()
    const concurrencyToken$ = new Subject()
    const responseToken$ = new Subject()

    const msg = msg =>
        `Limiter [${name}] ${msg}`

    const tokenId = ({requestId, rateToken, concurrencyToken}) =>
        `[${name}.${requestId.substr(-4)}${rateToken ? `.R${rateToken}` : ''}${concurrencyToken ? `.C${concurrencyToken}` : ''}]`

    const initialToken$ = count =>
        of(...(_.range(1, count + 1)))

    const rateLimit$ = maxRate
        ? concat(initialToken$(maxRate), rateToken$)
        : requestId$.pipe(mapTo())

    const concurrencyLimit$ = maxConcurrency
        ? concat(initialToken$(maxConcurrency), concurrencyToken$)
        : requestId$.pipe(mapTo())

    const token$ = zip(
        requestId$,
        rateLimit$,
        concurrencyLimit$
    ).pipe(
        map(([requestId, rateToken, concurrencyToken]) =>
            ({requestId, rateToken, concurrencyToken})
        )
    )

    const serveToken = token =>
        responseToken$.next(token)

    const recycleRateToken = token => {
        if (!token)
            throw new Error('token is required')
        if (token && maxRate) {
            log.debug(msg(`recycling rate token ${token.rateToken}/${maxRate} from token ${tokenId(token)}`))
            rateToken$.next(token.rateToken)
        }
    }

    const recycleConcurrencytoken = token => {
        if (!token)
            throw new Error('token is required')
        if (maxConcurrency) {
            log.debug(msg(`recycling concurrency token ${token.concurrencyToken}/${maxConcurrency} from token ${tokenId(token)}`))
            concurrencyToken$.next(token.concurrencyToken)
        }
    }

    token$.pipe(
        tap(token => serveToken(token)),
        delay(rateWindowMs)
    ).subscribe(
        token => recycleRateToken(token),
        error => log.fatal(msg('token stream failed:'), error),
        () => log.fatal(msg('token stream completed'))
    )

    return (requestId = uuid()) => {
        log.debug(msg(`requesting token for request [${requestId.substr(-4)}]`))
        const response$ = new ReplaySubject()
        let currentToken
        let canceled
        responseToken$.pipe(
            filter(({requestId: currentRequestId}) => currentRequestId === requestId),
            tap(token => currentToken = token),
            map(token => tokenId(token)),
            first(),
            finalize(() => {
                if (canceled) {
                    log.debug(msg('cancelling token'), currentToken)
                    recycleConcurrencytoken(currentToken)
                }
            }),
        ).subscribe(
            token => {
                log.debug(msg(`serving token ${token}`))
                response$.next(token)
            },
            error => log.fatal(msg('token stream failed:'), error)
            // stream is allowed to complete
        )

        return defer(() => {
            requestId$.next(requestId)
            return response$.pipe(
                finalize(() => {
                    if (currentToken) {
                        recycleConcurrencytoken(currentToken)
                    } else {
                        canceled = true
                    }
                }),
            )
        })
    }
}

const withLimiter$ = limiter =>
    observable$ =>
        service.submit$(limiter, uuid()).pipe(
            mergeMap(() => observable$)
        )

const Limiter = (name, options) => {
    const limiter = {
        name,
        service$: Limiter$(options)
    }
    return {
        limiter,
        limiter$: withLimiter$(limiter)
    }
}

module.exports = {Limiter, Limiter$}

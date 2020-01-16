const {Subject, ReplaySubject, zip, concat, of} = require('rxjs')
const {first, map, filter, delay, finalize, switchMap, tap, mapTo, takeUntil, mergeMap} = require('rxjs/operators')
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
        if (token && maxRate) {
            log.debug(msg(`recycling rate token ${token.rateToken}/${maxRate} from token ${tokenId(token)}`))
            rateToken$.next(token.rateToken)
        }
    }
    
    const recycleConcurrencytoken = token => {
        if (token && maxConcurrency) {
            log.debug(msg(`recycling concurrency token ${token.concurrencyToken}/${maxConcurrency} from token ${tokenId(token)}`))
            concurrencyToken$.next(token.concurrencyToken)
        }
    }

    token$.subscribe(
        token => serveToken(token),
        error => log.fatal(msg('token stream failed:'), error),
        () => log.fatal(msg('token stream completed'))
    )
    
    token$.pipe(
        delay(rateWindowMs)
    ).subscribe(
        token => recycleRateToken(token),
        error => log.fatal(msg('token stream failed:'), error),
        () => log.fatal(msg('token stream completed'))
    )

    return (requestId = uuid()) => {
        log.debug(msg(`requesting token for request [${requestId.substr(-4)}]`))
        const response$ = new ReplaySubject()
        responseToken$.pipe(
            filter(({requestId: currentRequestId}) => currentRequestId === requestId),
            first()
        ).subscribe(
            token => response$.next(token),
            error => log.fatal(msg('token stream failed:'), error)
            // stream is allowed to complete
        )
        requestId$.next(requestId)
        return response$.pipe(
            tap(token => log.debug(msg(`serving token ${token}`))),
            switchMap(currentToken =>
                response$.pipe(
                    map(token => tokenId(token)),
                    finalize(() => recycleConcurrencytoken(currentToken))
                )
            )
        )
    }
}

const withLimiter$ = limiter =>
    observable$ => {
        const releaseToken$ = new Subject()
        const requestId = uuid()
        const token$ = service.submit$(limiter, requestId)
        
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

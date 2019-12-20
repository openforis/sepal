const {Subject, ReplaySubject, zip, concat, of} = require('rxjs')
const {first, map, filter, delay, finalize, tap, mapTo} = require('rxjs/operators')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const log = require('./log')('limiter')

const Limiter = ({name, rateWindowMs = 1000, rateLimit, concurrencyLimit}) => {
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

    const rateLimit$ = rateLimit
        ? concat(initialToken$(rateLimit), rateToken$)
        : requestId$.pipe(mapTo())

    const concurrencyLimit$ = concurrencyLimit
        ? concat(initialToken$(concurrencyLimit), concurrencyToken$)
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
        if (rateLimit) {
            log.debug(msg(`recycling rate token ${token.rateToken}/${rateLimit} from token ${tokenId(token)}`))
            rateLimit && rateToken$.next(token.rateToken)
        }
    }
    
    const recycleConcurrencytoken = token => {
        if (concurrencyLimit) {
            log.debug(msg(`recycling concurrency token ${token.concurrencyToken}/${concurrencyLimit} from token ${tokenId(token)}`))
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

    const next$ = (requestId = uuid()) => {
        let currentToken
        log.debug(msg(`requesting token for request [${requestId.substr(-4)}]`))
        const response$ = new ReplaySubject()
        responseToken$.pipe(
            filter(({requestId: currentRequestId}) =>
                currentRequestId === requestId
            ),
            first(),
        ).subscribe(
            token => {
                currentToken = token
                response$.next(tokenId(token))
            },
            error => log.fatal(msg('token stream failed:'), error)
            // stream is allowed to complete
        )
        requestId$.next(requestId)
        return response$.pipe(
            tap(token => log.debug(msg(`serving token ${token}`))),
            finalize(() => recycleConcurrencytoken(currentToken))
        )
    }

    return {next$}
}

module.exports = Limiter

const {Subject, ReplaySubject, zip, concat, of} = require('rxjs')
const {first, map, filter, delay, finalize, tap, mapTo} = require('rxjs/operators')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const log = require('../log')('token')

const requestId$ = new Subject()
const rateToken$ = new Subject()
const concurrencyToken$ = new Subject()
const responseToken$ = new Subject()

const initialToken$ = count =>
    of(...(_.range(1, count + 1)))

const msg = ({requestId, rateToken, concurrencyToken}) =>
    `[Token.${requestId.substr(-4)}${rateToken ? `.R${rateToken}` : ''}${concurrencyToken ? `.C${concurrencyToken}` : ''}]`

const tokenService = ({rateWindowMs = 1000, rateLimit, concurrencyLimit}) => {
    const token$ = zip(
        requestId$,
        rateLimit
            ? concat(initialToken$(rateLimit), rateToken$)
            : requestId$.pipe(mapTo()),
        concurrencyLimit
            ? concat(initialToken$(concurrencyLimit), concurrencyToken$)
            : requestId$.pipe(mapTo())
    ).pipe(
        map(([requestId, rateToken, concurrencyToken]) =>
            ({requestId, rateToken, concurrencyToken})
        ),
    )

    const serveToken = token =>
        responseToken$.next(token)
    
    const recycleRateToken = token => {
        if (rateLimit) {
            log.debug(`Recycling rate token ${token.rateToken}/${rateLimit} from ${msg(token)}`)
            rateLimit && rateToken$.next(token.rateToken)
        }
    }
    
    const recycleConcurrencytoken = token => {
        if (concurrencyLimit) {
            log.debug(`Recycling concurrency token ${token.concurrencyToken}/${concurrencyLimit} from ${msg(token)}`)
            concurrencyToken$.next(token.concurrencyToken)
        }
    }

    token$.subscribe(
        token => serveToken(token),
        error => log.fatal('Token stream failed:', error),
        () => log.fatal('Token stream completed')
    )
    
    token$.pipe(
        delay(rateWindowMs)
    ).subscribe(
        token => recycleRateToken(token),
        error => log.fatal('Token stream failed:', error),
        () => log.fatal('Token stream completed')
    )

    const handle$ = (requestId = uuid()) => {
        let currentToken
        log.debug(`Requesting token for request [${requestId.substr(-4)}]`)
        const response$ = new ReplaySubject()
        responseToken$.pipe(
            filter(({requestId: currentRequestId}) =>
                currentRequestId === requestId
            ),
            first(),
        ).subscribe(
            token => {
                currentToken = token
                response$.next(token)
            },
            error => log.fatal('Token stream failed:', error)
            // stream is allowed to complete
        )
        requestId$.next(requestId)
        return response$.pipe(
            tap(token => log.debug(`Serving token ${msg(token)}`)),
            finalize(() => recycleConcurrencytoken(currentToken))
        )
    }

    return {handle$}
}

module.exports = tokenService

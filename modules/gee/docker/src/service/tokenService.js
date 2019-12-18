const {Subject, ReplaySubject, zip, concat, of, merge} = require('rxjs')
const {first, map, filter, delay, finalize, tap} = require('rxjs/operators')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const log = require('../log')('token')

const requestId$ = new Subject()
const rateToken$ = new Subject()
const concurrencyToken$ = new Subject()
const responseToken$ = new Subject()

const initialToken$ = count =>
    of(...(_.range(1, count + 1)))

const tokenService = ({rateWindowMs = 1000, rateLimit, concurrencyLimit}) => {
    const token$ = zip(
        requestId$,
        concat(initialToken$(rateLimit), rateToken$),
        concat(initialToken$(concurrencyLimit), concurrencyToken$)
    ).pipe(
        map(([requestId, rateToken, concurrencyToken]) =>
            ({requestId, rateToken, concurrencyToken})
        ),
    )

    const msg = ({requestId, rateToken, concurrencyToken}) =>
        `[Token.${requestId.substr(-4)}.R${rateToken}.C${concurrencyToken}]`

    const serveToken = token =>
        responseToken$.next(token)
    
    const recycleRateToken = token => {
        log.debug(`Recycling rate token ${token.rateToken}/${rateLimit} from ${msg(token)}`)
        rateToken$.next(token.rateToken)
    }
    
    const recycleConcurrencytoken = token => {
        log.debug(`Recycling concurrency token ${token.concurrencyToken}/${concurrencyLimit} from ${msg(token)}`)
        concurrencyToken$.next(token.concurrencyToken)
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

const {Subject, ReplaySubject, zip, concat, of} = require('rxjs')
const {first, map, filter, delay, finalize} = require('rxjs/operators')
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
    
    token$.subscribe(
        token => {
            // log.debug('Serving token', msg(token))
            responseToken$.next(token)
        },
        error => log.fatal('Token stream failed:', error),
        () => log.fatal('Token stream completed')
    )
    
    token$.pipe(
        delay(rateWindowMs)
    ).subscribe(
        token => {
            log.debug(`Recycling rate token ${token.rateToken}/${rateLimit} from ${msg(token)}`)
            // log.debug(`Recycling rate token R${token.rateToken} from ${msg(token)}`)
            rateToken$.next(token.rateToken)
        },
        error => log.fatal('Token stream failed:', error),
        () => log.fatal('Token stream completed')
    )
    
    const handle$ = () => {
        const requestId = uuid()
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
                log.debug(`Serving token ${msg(token)}`)
                response$.next(token)
            },
            error => log.fatal('Token stream failed:', error)
            // stream is allowed to complete
        )
        requestId$.next(requestId)
        return response$.pipe(
            finalize(() => {
                log.debug(`Recycling concurrency token ${currentToken.concurrencyToken}/${concurrencyLimit} from ${msg(currentToken)}`)
                concurrencyToken$.next(currentToken.concurrencyToken)
            })
        )
    }

    return {handle$}
}

module.exports = tokenService

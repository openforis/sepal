const {Subject, ReplaySubject, zip, concat, of} = require('rxjs')
const {first, map, filter, delay, finalize} = require('rxjs/operators')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const log = require('../log')('token')

const rateToken$ = new Subject()
const concurrencyToken$ = new Subject()
const requestToken$ = new Subject()
const responseToken$ = new Subject()

const initialToken$ = count =>
    of(...(_.range(1, count + 1)))

const tokenService = ({rateWindowMs = 1000, rateLimit, concurrencyLimit}) => {
    const token$ = zip(
        concat(initialToken$(rateLimit), rateToken$),
        concat(initialToken$(concurrencyLimit), concurrencyToken$),
        requestToken$
    ).pipe(
        map(([rateToken, concurrencyToken, requestToken]) =>
            ({rateToken, concurrencyToken, requestToken})
        ),
    )
    
    token$.subscribe(
        token => {
            log.debug('Serving token:', token)
            responseToken$.next(token)
        },
        error => log.fatal('Token stream failed:', error),
        () => log.fatal('Token stream completed')
    )
    
    token$.pipe(
        delay(rateWindowMs)
    ).subscribe(
        ({rateToken}) => {
            log.debug('Recycling rate token:', rateToken)
            rateToken$.next(rateToken)
        },
        error => log.fatal('Token stream failed:', error),
        () => log.fatal('Token stream completed')
    )
    
    const handle$ = () => {
        const requestId = uuid()
        let currentToken
        log.debug('Getting token for request:', requestId)
        const response$ = new ReplaySubject()
        responseToken$.pipe(
            filter(({requestToken: {requestId: tokenRequestId}}) =>
                tokenRequestId === requestId
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
        requestToken$.next({requestId})
        return response$.pipe(
            finalize(() => {
                log.debug('Recycling concurrency token:', currentToken.concurrencyToken)
                concurrencyToken$.next(currentToken.concurrencyToken)
            })
        )
    }

    return {handle$}
}

module.exports = tokenService

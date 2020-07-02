const {Subject, ReplaySubject, defer, zip, concat, of} = require('rx')
const {first, map, filter, delay, tap, mapTo} = require('rx/operators')
const {finalize} = require('sepal/rxjs/operators')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const log = require('sepal/log').getLogger('limiter')

const Limiter$ = ({name, rateWindowMs = 1000, maxRate, maxConcurrency}) => {
    const requestId$ = new Subject()
    const rateToken$ = new Subject()
    const concurrencyToken$ = new Subject()
    const responseToken$ = new Subject()

    const msg = msg =>
        `Limiter [${name}] ${msg}`

    const tokenId = ({requestId, rateToken, concurrencyToken}) =>
        `[${requestId}${rateToken ? `.R${rateToken}` : ''}${concurrencyToken ? `.C${concurrencyToken}` : ''}]`

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

    const assertToken = token => {
        if (!token) {
            throw new Error('Token is required')
        }
    }

    const recycleRateToken = token => {
        assertToken(token)
        if (maxRate) {
            log.debug(msg(`recycling rate token ${token.rateToken}/${maxRate} from token ${tokenId(token)}`))
            rateToken$.next(token.rateToken)
        }
    }

    const recycleConcurrencytoken = (token, cancelled) => {
        assertToken(token)
        if (maxConcurrency) {
            log.debug(msg(`recycling ${cancelled ? 'cancelled ' : ''}concurrency token ${token.concurrencyToken}/${maxConcurrency} from token ${tokenId(token)}`))
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

    const CurrentToken = () => {
        const current = {}
        return {
            set(token) {
                current.token = token
            },
            recycleOrCancel() {
                if (current.token) {
                    recycleConcurrencytoken(current.token, false)
                } else {
                    current.cancel = true
                }
            },
            recycleCancelled() {
                if (current.token && current.cancel) {
                    recycleConcurrencytoken(current.token, true)
                }
            }
        }
    }

    return (requestId = uuid().substr(-4)) => {
        log.debug(msg(`requesting token [${requestId}]`))
        const response$ = new ReplaySubject()
        const currentToken = CurrentToken()

        responseToken$.pipe(
            filter(({requestId: currentRequestId}) => currentRequestId === requestId),
            tap(token => currentToken.set(token)),
            map(token => tokenId(token)),
            first(),
            finalize(() => currentToken.recycleCancelled()),
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
                finalize(() => currentToken.recycleOrCancel()),
            )
        })
    }
}

module.exports = {Limiter$}

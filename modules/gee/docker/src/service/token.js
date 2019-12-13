const {Subject, ReplaySubject, zip} = require('rxjs')
const {first, map, filter, delay, finalize} = require('rxjs/operators')
const {v4: uuid} = require('uuid')
const log = require('../log')

const RATE_LIMIT_MS = 1000

const rateToken$ = new Subject()
const concurrencyToken$ = new Subject()
const requestToken$ = new Subject()
const responseToken$ = new Subject()

const token$ = zip(rateToken$, concurrencyToken$, requestToken$).pipe(
    map(([rateToken, jobToken, requestToken]) =>
        ({rateToken, jobToken, requestToken})
    ),
)

token$.subscribe({
    next: token => {
        log.debug('Serving token', token)
        responseToken$.next(token)
    },
    error: error => log.error('ERROR', error),
    complete: () => log.error('COMPLETE')
})

token$.pipe(
    delay(RATE_LIMIT_MS)
).subscribe({
    next: ({rateToken}) => {
        log.debug('Recycling rate token', rateToken)
        rateToken$.next(rateToken)
    },
    error: error => log.error('ERROR', error),
    complete: () => log.error('COMPLETE')
})

rateToken$.next(1)
rateToken$.next(2)
rateToken$.next(3)
rateToken$.next(4)
rateToken$.next(5)
concurrencyToken$.next(1)
concurrencyToken$.next(2)
concurrencyToken$.next(3)
concurrencyToken$.next(4)
concurrencyToken$.next(5)

// const handle$ = () => of({foo: 'bar'})

const handle$ = () => {
    const requestId = uuid()
    log.debug('Requesting token for request', requestId)
    const response$ = new ReplaySubject()
    responseToken$.pipe(
        filter(({requestToken: {requestId: tokenRequestId}}) =>
            tokenRequestId === requestId
        ),
        first(),
    ).subscribe(
        token => response$.next(token)
    )
    requestToken$.next({requestId})
    return response$.pipe(
        finalize(() => log.error('finalized'))
    )
}

module.exports = {handle$}

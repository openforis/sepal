const {concat, EMPTY, ReplaySubject, isObservable, throwError, pipe} = require('rx')
const {catchError, finalize, scan, switchMapTo, takeWhile} = require('rx/operators')
const log = require('sepal/log').getLogger('rxjs')

const push = (status$, description) => {
    log.trace(`Finalize registered: ${description}`)
    status$.next({description, value: 1})
}

const pull = (status$, description) => {
    log.trace(`Finalize completed: ${description}`)
    status$.next({description, value: -1})
}

const onFinalize = (status$, callback, description) => {
    const complete = () => pull(status$, description)
    push(status$, description)

    return pipe(
        finalize(() => {
            try {
                const result = callback()
                if (isObservable(result)) {
                    result.subscribe({
                        error: error => {
                            log.error(`Finalize failed: ${description}`, error)
                            complete()
                        },
                        complete
                    })
                } else {
                    complete()
                }
            } catch (e) {
                complete()
                throw e
            }
        })
    )
}

// const finalize$ = defer(() => _finalizeSubject
const onFinalize$ = status$ =>
    status$.pipe(
        scan((acc, {value}) => acc + value, 0),
        takeWhile(acc => {
            if (acc > 0) {
                return true
            } else {
                log.debug('All finalize blocks completed')
                return false
            }
        }),
        switchMapTo(EMPTY)
    )

const finalize$ = (observable$, finalizeCallback, description) => {
    const status$ = new ReplaySubject()
    return concat(
        observable$.pipe(
            onFinalize(status$, finalizeCallback, description),
            catchError(e => concat(
                onFinalize$(status$),
                throwError(e))
            )
        ),
        onFinalize$(status$)
    )
}

module.exports = {finalize$}

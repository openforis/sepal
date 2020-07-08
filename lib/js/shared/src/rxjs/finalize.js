const {concat, EMPTY, ReplaySubject, isObservable, throwError, pipe} = require('rx')
const {catchError, filter, finalize, scan, switchMapTo, takeWhile} = require('rx/operators')
const {v4: uuid} = require('uuid')
const log = require('sepal/log').getLogger('rxjs')

const status$ = new ReplaySubject()

const push = (context, description) => {
    log.trace(`Finalize registered: ${description}`)
    status$.next({context, description, value: 1})
}

const pull = (context, description) => {
    log.trace(`Finalize completed: ${description}`)
    status$.next({context, description, value: -1})
}

const onFinalize = (context, callback, description) => {
    const complete = () => pull(context, description)
    push(context, description)

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
const onFinalize$ = context =>
    status$.pipe(
        filter(({context: currentContext}) => context === currentContext),
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
    const context = uuid()
    return concat(
        observable$.pipe(
            onFinalize(context, finalizeCallback, description),
            catchError(e => concat(
                onFinalize$(context),
                throwError(e))
            )
        ),
        onFinalize$(context)
    )
}

module.exports = {finalize$}

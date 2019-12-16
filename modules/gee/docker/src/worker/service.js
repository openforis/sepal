const {Subject} = require('rxjs')
const {takeUntil} = require('rxjs/operators')
const log = require('@sepal/log')

let transport

const initMain = (request$, response$) => {
    const handle$ = ({servicePath, data}) =>
        require(`@sepal/${servicePath}`).handle$(data)

    const stop$ = new Subject()

    request$.subscribe(
        ({servicePath, data}) => {
            log.debug(`Service request for [${servicePath}] with data:`, data)
            handle$({servicePath, data}).pipe(
                takeUntil(stop$)
            ).subscribe(
                value => {
                    log.debug(`Service response for [${servicePath}]:`, value)
                    response$.next(value)
                }
            )
        },
        error => log.error(error),
        () => stop$.next()
    )
}

const initWorker = theTransport => {
    transport = theTransport
}

const request$ = (servicePath, data) => {
    const {in$: request$, out$: response$} = transport.createChannel('service')
    request$.next({servicePath, data})
    return response$
}

module.exports = {
    initMain,
    initWorker,
    request$
}

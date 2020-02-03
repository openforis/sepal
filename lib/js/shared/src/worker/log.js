const logSend = () => {
    const {ReplaySubject} = require('rxjs')
    const logger = require('sepal/log')
    const log$ = new ReplaySubject()

    const log = logger({
        trace: args => log$.next({level: 'trace', args}),
        debug: args => log$.next({level: 'debug', args}),
        info: args => log$.next({level: 'info', args}),
        warn: args => log$.next({level: 'warn', args}),
        error: args => log$.next({level: 'error', args}),
        fatal: args => log$.next({level: 'fatal', args}),
    })

    return {log, log$}
}

const logReceive = log$ => {
    const workerLog = require('sepal/log')('worker')
    log$.subscribe( // [TODO] does it need to be unsubscribed?
        ({level, args}) => workerLog[level](args)
    )
}

module.exports = {logSend, logReceive}

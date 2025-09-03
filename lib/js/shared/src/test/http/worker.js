const {timer, of, mergeMap, map, tap} = require('rxjs')
const {testLimiter$} = require('./testLimiter')
const log = require('#sepal/log').getLogger('test')

module.exports = ({
    requestTag,
    requestArgs: {
        workerMinDuration,
        workerMaxDuration = workerMinDuration,
        workerErrorProbability
    },
    initArgs: {mode},
    state
}) =>
    testLimiter$(
        of(true).pipe(
            tap(() => state.done = false),
            tap(() => log.debug(`${requestTag} worker$ start`, {state})),
            map(() => Math.round(Math.random() * (workerMaxDuration - workerMinDuration) + workerMinDuration)),
            mergeMap(duration =>
                timer(duration).pipe(
                    map(() => {
                        if (Math.random() < workerErrorProbability / 100) {
                            throw new Error('Forced error in worker$')
                        }
                        state.done = true
                        const value = `${mode} ${duration}ms (${workerMinDuration}-${workerMaxDuration}ms)\n`
                        log.debug(`${requestTag} worker$ end`, {state, value})
                        return value
                    })
                )
            )
        )
    )

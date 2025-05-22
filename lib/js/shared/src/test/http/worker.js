const {timer, of, mergeMap, map, tap} = require('rxjs')
const {testLimiter$} = require('./testLimiter')
const log = require('#sepal/log').getLogger('test')

module.exports = ({
    requestTag,
    requestArgs: {minDuration, maxDuration = minDuration, errorProbability},
    initArgs: {mode},
    state
}) =>
    testLimiter$(
        of(true).pipe(
            tap(() => state.done = false),
            tap(() => log.debug(`${requestTag} worker$ start`, {state})),
            map(() => Math.round(Math.random() * (maxDuration - minDuration) + minDuration)),
            mergeMap(duration =>
                timer(duration).pipe(
                    map(() => {
                        if (Math.random() < errorProbability / 100) {
                            throw new Error('Random error!')
                        }
                        state.done = true
                        const value = `${mode} ${duration}ms (${minDuration}-${maxDuration}ms)\n`
                        log.debug(`${requestTag} worker$ end`, {state, value})
                        return value
                    })
                )
            )
        )
    )

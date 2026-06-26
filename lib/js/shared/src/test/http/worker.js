import {map, mergeMap, of, tap, timer} from 'rxjs'

import {getLogger} from '#sepal/log'

import {testLimiter$} from './testLimiter.js'

const log = getLogger('test')

export default ({
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

const {timer, tap, switchMap, of, map} = require('rxjs')
const log = require('#sepal/log').getLogger('test')

module.exports = ({
    requestTag,
    requestArgs: {
        finalizeMinDuration = 0,
        finalizeMaxDuration = finalizeMinDuration,
        finalizeErrorProbability = 0
    },
    state
}) =>
    of(true).pipe(
        tap(() => log.debug(`${requestTag} finalize$ start`, {state, finalizeMinDuration, finalizeMaxDuration, finalizeErrorProbability})),
        map(() => Math.round(Math.random() * (finalizeMaxDuration - finalizeMinDuration) + finalizeMinDuration)),
        switchMap(duration => timer(duration)),
        tap(() => {
            if (Math.random() < finalizeErrorProbability / 100) {
                throw new Error('Forced error in finalize$')
            }
        }),
        tap(() => log.debug(`${requestTag} finalize$ end`, {state})),
    )

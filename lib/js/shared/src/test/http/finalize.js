const {timer, tap, switchMap, of} = require('rxjs')
const log = require('#sepal/log').getLogger('test')

module.exports = ({
    requestTag,
    state
}) =>
    of(true).pipe(
        tap(() => log.debug(`${requestTag} finalize$ start`, {state})),
        switchMap(() => timer(3000)),
        tap(() => log.debug(`${requestTag} finalize$ end`, {state})),
    )

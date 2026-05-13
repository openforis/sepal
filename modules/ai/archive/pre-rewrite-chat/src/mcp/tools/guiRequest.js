const {map, catchError, of} = require('rxjs')
const {isAbortError} = require('../../chat/abort')

// payload is nested, not spread, so its fields (e.g. recipe `type`) can't
// collide with the routing keys `type: 'gui-action'` and `action`.
const guiRequest$ = (request$, action, payload = {}, options = {}) =>
    request$({type: 'gui-action', action, params: payload}, options).pipe(
        map(data => ({success: true, data})),
        catchError(error => {
            if (isAbortError(error)) throw error
            return of({success: false, error: {code: 'GUI_REQUEST_FAILED', message: error.message}})
        })
    )

module.exports = {guiRequest$}

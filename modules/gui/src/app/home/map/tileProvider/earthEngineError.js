import {from, map, switchMap, tap, throwError} from 'rxjs'
import Notifications from 'widget/notifications'

const FALLBACK_ERROR_MESSAGE = 'Malformed error response'

const parseErrorMessage = text => {
    try {
        const earthEngineError = JSON.parse(text)
        return earthEngineError?.error?.message || FALLBACK_ERROR_MESSAGE
    } catch (error) {
        return FALLBACK_ERROR_MESSAGE
    }
}

export const handleError$ = (error, retryError) =>
    from(error.response.text()).pipe(
        map(parseErrorMessage),
        tap(error => Notifications.error({message: 'Tile failed', error, group: 'tileError', timeout: 0})),
        switchMap(error => throwError(() => `${error} ${retryError}`))
    )

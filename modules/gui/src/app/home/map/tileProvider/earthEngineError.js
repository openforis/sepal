import {Notifications} from 'widget/notifications'
import {from, map, switchMap, tap, throwError} from 'rxjs'

const FALLBACK_ERROR_MESSAGE = 'Malformed error response'

const parseErrorMessage = text => {
    try {
        const earthEngineError = JSON.parse(text)
        return earthEngineError?.error?.message || FALLBACK_ERROR_MESSAGE
    } catch (error) {
        return FALLBACK_ERROR_MESSAGE
    }
}

const showNotification = error =>
    Notifications.error({message: 'Earth Engine tile rendering failed', error, group: true, timeout: 0})

export const handleError$ = (error, retryError) =>
    from(error.response.text()).pipe(
        map(parseErrorMessage),
        tap(eeError => showNotification(eeError)),
        switchMap(eeError => throwError(() => `${eeError} ${retryError}`))
    )

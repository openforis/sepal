import {msg} from '~/translate'
import {Notifications} from '~/widget/notifications'

// Success is acknowledged where the user clicked, so it is reported back rather than published. Failure stays
// global: a refused write leaves nothing on screen to notice, and the user's next move is pasting elsewhere.
// Always resolves, so no caller has to guard against an unhandled rejection.
export const copyToClipboard = (value, {failureMessage} = {}) =>
    navigator.clipboard.writeText(value)
        .then(() => true)
        .catch(() => {
            Notifications.error({
                message: failureMessage || msg('clipboard.copy.failure'),
                timeout: 3
            })
            return false
        })

export const isReadClipboardSupported = () =>
    navigator.clipboard.readText

export const readClipboard = () =>
    navigator.clipboard.readText()
        ? navigator.clipboard.readText()
        : Promise.reject(new Error('Reading from clipboard is not supported'))

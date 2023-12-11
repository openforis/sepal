import {msg} from 'translate'
import Notifications from 'widget/notifications'

export const copyToClipboard = (value, successMessage, failureMessage) =>
    navigator.clipboard.writeText(value)
        .then(() => {
            Notifications.success({
                message: successMessage || msg('clipboard.copy.success'),
                timeout: 3
            })
        })
        .catch(() => {
            Notifications.error({
                message: failureMessage || msg('clipboard.copy.failure'),
                timeout: 3
            })
        })

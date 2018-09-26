import {connect} from 'react-redux'
import {dispatchable} from 'store'
import {msg} from 'translate'
import ReactNotifications, * as notifications from 'react-notification-system-redux'

const mapStateToProps = (state) => {
    return ({
        notifications: state.notifications,
        style: {
            NotificationItem: {
                DefaultStyle: {
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    color: '#fff',
                    lineHeight: '1.5'
                }
            },
            Title: {
                DefaultStyle: {}
            }
        }
    })
}

const toOpts = ({level, messageId, values = {}, message, autoDismiss = 5}) => ({
    title: msg([messageId, level, 'title'].join('.'), values),
    message: message || msg([messageId, level, 'message'].join('.'), values, ' '),
    position: 'tr',
    autoDismiss,
    dismissible: 'click',
    action: null,
    children: null,
    onAdd: null,
    onRemove: null,
    uid: null
})

const errorMessage = (error) => {
    if (!error) return null
    const connectionError = error.request && error.status === 0
    return connectionError
        ? msg('notifications.error.connectionError')
        : msg('notifications.error.generic')
}

const notify = (level, messageId, values) =>
    dispatchable(notifications[level](toOpts({level, messageId, values})))

const Notifications = connect(mapStateToProps)(ReactNotifications)
Notifications.caught = (messageId, values, error) => dispatchable(notifications.error(toOpts({
    level: 'error', messageId, values, message: errorMessage(error), autoDismiss: 0
})))
Notifications.success = (messageId, values) => notify('success', messageId, values)
Notifications.error = (messageId, values) => notify('error', messageId, values)
Notifications.warning = (messageId, values) => notify('warning', messageId, values)
Notifications.info = (messageId, values) => notify('info', messageId, values)
Notifications.hide = dispatchable(notifications.hide)
Notifications.removeAll = dispatchable(notifications.removeAll)

export default Notifications

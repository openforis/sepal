import {connect} from 'react-redux'
import {dispatchable} from 'store'
import {msg} from 'translate'
import {v4 as uuid} from 'uuid'
import ReactNotifications, * as notifications from 'react-notification-system-redux'
import _ from 'lodash'

const mapStateToProps = state => ({
    notifications: state.notifications,
    style: {
        NotificationItem: {
            DefaultStyle: {
                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                color: '#fff',
                lineHeight: '1.5'
            }
        },
        Title: {
            DefaultStyle: {}
        }
    }
})

const errorMessage = error => {
    if (!error) return null
    const connectionError = error.request && error.status === 0
    return connectionError
        ? msg('notifications.error.connectionError')
        : msg('notifications.error.generic')
}

const Notifications = connect(mapStateToProps)(ReactNotifications)

Notifications.show = (level, {messageId, values = {}, content, uid = uuid(), ...options}) =>
    dispatchable(
        notifications[level](_.defaults(options, {
            title: messageId && msg([messageId, level, 'title'].join('.'), values),
            message: messageId && msg([messageId, level, 'message'].join('.'), values, ' '),
            action: null,
            position: 'tr',
            dismissible: 'click',
            autoDismiss: 5,
            children: content && content(uid),
            uid
        }))
    )

Notifications.caught = (messageId, values, error) =>
    Notifications.show('error', {messageId, values, message: errorMessage(error), autoDismiss: 0})

Notifications.success = (messageId, values) =>
    Notifications.show('error', {messageId, values})

Notifications.success = (messageId, values) =>
    Notifications.show('success', {messageId, values})

Notifications.error = (messageId, values) =>
    Notifications.show('error', {messageId, values})

Notifications.warning = (messageId, values) =>
    Notifications.show('warning', {messageId, values})

Notifications.info = (messageId, values) =>
    Notifications.show('info', {messageId, values})

Notifications.hide = uid =>
    dispatchable(notifications.hide(uid))

Notifications.removeAll = () =>
    dispatchable(notifications.removeAll())

export default Notifications

import {connect} from 'react-redux'
import ReactNotifications, * as notifications from 'react-notification-system-redux'
import {dispatchable} from 'store'
import {msg} from 'translate'

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

function toOpts(level, messageId, values = {}, message) {
    return {
        title: msg([messageId, level, 'title'].join('.'), values),
        message: message || msg([messageId, level, 'message'].join('.'), values, ' '),
        position: 'tr',
        autoDismiss: 10,
        dismissible: 'click',
        action: null,
        children: null,
        onAdd: null,
        onRemove: null,
        uid: null
    }
}

const errorMessage = (error) => {
    if (!error) return null
    switch (error.status) {
    case 0:
        return 'Failed to connect to Sepal. ' +
                'Either your internet connection failed, or Sepal is unavailable at the moment.'
    default:
        return 'Sepal responded with an error. Please try again.'
    }
}

const notify = (level, messageId, values) =>
    dispatchable(notifications[level](toOpts(level, messageId, values)))

const Notifications = connect(mapStateToProps)(ReactNotifications)
Notifications.caught = (messageId, values, error) => dispatchable(notifications.error(toOpts('error', messageId, values, errorMessage(error))))
Notifications.success = (messageId, values) => notify('success', messageId, values)
Notifications.error = (messageId, values) => notify('error', messageId, values)
Notifications.warning = (messageId, values) => notify('warning', messageId, values)
Notifications.info = (messageId, values) => notify('info', messageId, values)
Notifications.hide = dispatchable(notifications.hide)
Notifications.removeAll = dispatchable(notifications.removeAll)
export default Notifications
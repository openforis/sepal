import {connect} from 'react-redux'
import ReactNotifications, * as notifications from 'react-notification-system-redux'
import {msg} from 'translate'
import {toMessage} from 'app/error'

const mapStateToProps = (state) => {
    return ({
        notifications: state.notifications,
        style: {
            NotificationItem: {
                DefaultStyle: {
                    fontSize: '.8rem',
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    color: '#fff',
                    lineHeight: '1.5'
                }
            },
            Title: {
                DefaultStyle: {
                    fontSize: '.8rem'
                }
            }
        }
    })
}

function toOpts(level, messageId, values = {}, message) {
    return {
        title: msg([messageId, level, 'title'].join('.'), values),
        message: message || msg([messageId, level, 'message'].join('.'), values, ' '),
        position: 'tr',
        autoDismiss: 5,
        dismissible: 'click',
        action: null,
        children: null,
        onAdd: null,
        onRemove: null,
        uid: null
    }
}

const Notifications = connect(mapStateToProps)(ReactNotifications)
Notifications.success = (messageId, values) => notifications.success(toOpts('success', messageId, values))
Notifications.error = (messageId, error, values) => notifications.error(toOpts('error', messageId, values, toMessage(error)))
Notifications.warning = (messageId, values) => notifications.warning(toOpts('warning', messageId, values))
Notifications.info = (messageId, values) => notifications.info(toOpts('info', messageId, values))
Notifications.hide = notifications.hide
Notifications.removeAll = notifications.removeAll
export default Notifications
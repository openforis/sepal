import {connect} from 'react-redux'
import ReactNotifications, * as notifications from 'react-notification-system-redux'

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

function applyDefaults(opts) {
    const defaultOpts = {
        title: null,
        message: null,
        position: 'tr',
        autoDismiss: 5,
        dismissible: 'click',
        action: null,
        children: null,
        onAdd: null,
        onRemove: null,
        uid: null
    }
    return Object.assign(defaultOpts, opts)
}

const Notifications = connect(mapStateToProps)(ReactNotifications)
Notifications.show = (opts) => notifications.show(applyDefaults(opts))
Notifications.success = (opts) => notifications.success(applyDefaults(opts))
Notifications.error = (opts) => notifications.error(applyDefaults(opts))
Notifications.warning = (opts) => notifications.warning(applyDefaults(opts))
Notifications.info = (opts) => notifications.info(applyDefaults(opts))
Notifications.hide = notifications.hide
Notifications.removeAll = notifications.removeAll
export default Notifications
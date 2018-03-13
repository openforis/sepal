import {connect} from 'react-redux'
import ReactNotifications, * as notifications from 'react-notification-system-redux'

const mapStateToProps = (state) => {
    console.log('updating notifications', state)
    return ({notifications: state.notifications})
}

const Notifications = connect(mapStateToProps)(ReactNotifications)
export default Notifications

export const show = notifications.show
export const success = notifications.success
export const error = notifications.error
export const warning = notifications.warning
export const info = notifications.info
export const hide = notifications.hide
export const removeAll = notifications.removeAll
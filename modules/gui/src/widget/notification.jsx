import PropTypes from 'prop-types'
import React from 'react'

import {Notifications} from './notifications'

// A notification that is on screen exactly as long as this component is mounted, and follows its
// props: rendering it raises it, re-rendering with other props updates it in place, unmounting
// withdraws it. It neither times out nor is dismissed by a click unless asked, since its lifetime
// is the component's.
export class Notification extends React.Component {
    render() {
        return null
    }

    componentDidMount() {
        this.publish()
    }

    componentDidUpdate() {
        this.publish()
    }

    componentWillUnmount() {
        const {id} = this.props
        Notifications.dismiss(id)
    }

    publish() {
        const {id, level, title, message, content, link, dismissable, timeout, onDismiss} = this.props
        Notifications[level]({id, title, message, content, link, dismissable, timeout, onDismiss})
    }
}

Notification.defaultProps = {
    level: 'info',
    dismissable: false,
    timeout: 0
}

Notification.propTypes = {
    id: PropTypes.string.isRequired,
    content: PropTypes.func,
    dismissable: PropTypes.any,
    level: PropTypes.oneOf(['info', 'success', 'warning', 'error']),
    link: PropTypes.string,
    message: PropTypes.string,
    timeout: PropTypes.number,
    title: PropTypes.string,
    onDismiss: PropTypes.func
}

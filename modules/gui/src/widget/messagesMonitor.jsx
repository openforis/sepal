import React from 'react'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {compose} from '~/compose'
import {getLogger} from '~/log'
import {withSubscriptions} from '~/subscription'

const log = getLogger('messagesMonitor')

// Keeps user.messages in sync with the message module over its gateway websocket. The module
// pushes the full list on subscribe (and re-subscribe after reconnect) and on every change: an
// admin saving or removing a message, or the user changing their own read state from another tab.
class _MessagesMonitor extends React.Component {
    notifications = api.message.ws()

    render() {
        return null
    }

    componentDidMount() {
        const {addSubscription} = this.props
        addSubscription(
            this.notifications.downstream$.subscribe({
                next: msg => this.onMessage(msg),
                error: error => log.error('downstream$ error', error),
                complete: () => log.error('downstream$ complete')
            })
        )
    }

    onMessage({data}) {
        data !== undefined && this.onData(data)
    }

    onData({notifications}) {
        actionBuilder('UPDATE_MESSAGES')
            .set('user.messages', notifications)
            .dispatch()
    }
}

export const MessagesMonitor = compose(
    _MessagesMonitor,
    withSubscriptions()
)

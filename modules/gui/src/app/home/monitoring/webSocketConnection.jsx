import React from 'react'

import {subscribe} from '~/api/ws'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {withSubscriptions} from '~/subscription'
import {currentUser} from '~/user'

class _WebSocketConnection extends React.Component {
    render() {
        const {user} = this.props
        return user ? <WebSocketSubscriber/> : null
    }
}

export const WebSocketConnection = compose(
    _WebSocketConnection,
    connect(() => ({user: currentUser()}))
)

class _WebSocketSubscriber extends React.Component {
    componentDidMount() {
        const {addSubscription} = this.props
        addSubscription(
            subscribe()
        )
    }

    render() {
        return null
    }
}

const WebSocketSubscriber = compose(
    _WebSocketSubscriber,
    withSubscriptions()
)

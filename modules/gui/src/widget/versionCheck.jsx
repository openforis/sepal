import React from 'react'
import {filter} from 'rxjs'

import {event$} from '~/api/ws'
import {compose} from '~/compose'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'

import {Button} from './button'
import {Notifications} from './notifications'

class _VersionCheck extends React.Component {
    constructor(props) {
        super(props)
        this.notify = this.notify.bind(this)
        this.renderReloadButton = this.renderReloadButton.bind(this)
    }

    render() {
        return null
    }

    componentDidMount() {
        const {addSubscription} = this.props
        addSubscription(
            event$.pipe(
                filter(({versionMismatch}) => versionMismatch)
            ).subscribe(this.notify)
        )
    }

    notify() {
        Notifications.success({
            title: msg('home.versionMismatch.title'),
            message: msg('home.versionMismatch.message'),
            timeout: 0,
            group: true,
            content: this.renderReloadButton
        })
    }

    renderReloadButton() {
        return (
            <Button
                look={'add'}
                shape='pill'
                label={msg('home.versionMismatch.reloadNow')}
                width='max'
                onClick={this.reload}
            />
        )
    }

    reload() {
        window.location.replace('/')
    }
}

export const VersionCheck = compose(
    _VersionCheck,
    withSubscriptions()
)

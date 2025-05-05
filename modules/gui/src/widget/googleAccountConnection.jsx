import React from 'react'
import {filter, switchMap} from 'rxjs'

import {event$} from '~/api/ws'
import {userDetailsHint} from '~/app/home/user/userDetails'
import {compose} from '~/compose'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {loadUser$} from '~/user'

import {Notifications} from './notifications'

class _GoogleAccountConnection extends React.Component {
    render() {
        return null
    }

    componentDidMount() {
        const {addSubscription} = this.props
        addSubscription(
            event$.pipe(
                filter(({type}) => type === 'googleAccessTokenRemoved'),
                switchMap(() => loadUser$())
            ).subscribe(
                () => this.notify()
            )
        )
    }

    notify() {
        userDetailsHint(true)
        Notifications.error({
            title: msg('user.googleAccount.revoked.title'),
            message: msg('user.googleAccount.revoked.message'),
            timeout: 0,
            group: true,
            onDismiss: () => userDetailsHint(false)
        })
    }
}

export const GoogleAccountConnection = compose(
    _GoogleAccountConnection,
    withSubscriptions()
)

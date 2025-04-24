import React from 'react'
import {filter, map} from 'rxjs'

import {event$} from '~/api/ws'
import {compose} from '~/compose'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {updateUser} from '~/user'

import {Notifications} from './notifications'

class _User extends React.Component {
    render() {
        return null
    }

    componentDidMount() {
        const {addSubscription} = this.props
        addSubscription(
            event$.pipe(
                filter(({userUpdate}) => userUpdate),
                map(({userUpdate}) => userUpdate)
            ).subscribe(
                user => {
                    updateUser(user)
                    this.notify()
                }
            )
        )
    }

    notify() {
        Notifications.success({
            title: msg('user.userDetails.update.success'),
            group: true
        })
    }
}

export const User = compose(
    _User,
    withSubscriptions()
)

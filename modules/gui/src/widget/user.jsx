import React from 'react'
import {filter, map} from 'rxjs'

import {event$} from '~/api/ws'
import {compose} from '~/compose'
import {withSubscriptions} from '~/subscription'
import {updateUser} from '~/user'

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
                user => updateUser(user)
            )
        )
    }

}

export const User = compose(
    _User,
    withSubscriptions()
)

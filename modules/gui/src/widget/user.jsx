import React from 'react'
import {filter, switchMap} from 'rxjs'

import {event$} from '~/api/ws'
import {compose} from '~/compose'
import {withSubscriptions} from '~/subscription'
import {loadUser$} from '~/user'

class _User extends React.Component {
    render() {
        return null
    }

    componentDidMount() {
        const {addSubscription} = this.props
        addSubscription(
            event$.pipe(
                filter(({type}) => type === 'userUpdated'),
                switchMap(() => loadUser$())
            ).subscribe()
        )
    }

}

export const User = compose(
    _User,
    withSubscriptions()
)

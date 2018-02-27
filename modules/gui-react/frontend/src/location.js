import React from 'react'
import PropTypes from 'prop-types'
import {Router} from 'react-router'
import rx from 'rxjs'
import {named} from 'named'

const location$ = named('LOCATION', new rx.BehaviorSubject())
export default location$

export class EventPublishingRouter extends React.Component {
    static propTypes = {
        history: PropTypes.object.isRequired,
        children: PropTypes.node,
    }

    publishLocationChange = location => {
        location$.next(location)
    }

    componentWillMount() {
        const history = this.props.history
        this.unsubscribeFromHistory = history.listen(this.publishLocationChange)
        this.publishLocationChange(history.location)
    }

    componentWillUnmount() {
        if (this.unsubscribeFromHistory) this.unsubscribeFromHistory()
    }

    render() {
        return <Router {...this.props} />
    }
}

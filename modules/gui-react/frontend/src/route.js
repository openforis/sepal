import React from 'react'
import PropTypes from 'prop-types'
import QueryString from 'query-string'
import {Router} from 'react-router'
import rx from 'rxjs'
import {named} from 'named'
import {Reducer} from './observer'

const router = require('react-router-dom')

let history = null

export const location$ = named('LOCATION', new rx.BehaviorSubject())
export const getQuery = (location) => QueryString.parse(location.search)

const renderMergedProps = (component, ...rest) => {
    return React.createElement(component, Object.assign({}, ...rest))
}

export const Route = ({component, ...rest}) => {
    return (
        <router.Route {...rest} render={routeProps => {
            return renderMergedProps(component, routeProps, rest)
        }}/>
    )
}
Route.propTypes = {
    component: PropTypes.func.isRequired
}

export const Switch = router.Switch
Switch.propTypes = {
    location: PropTypes.object.isRequired
}

export const Link = router.Link
Link.propTypes = router.Link.propTypes


export const locationReducer = new Reducer(location$, (location, state) => {
    location.query = getQuery(location)
    return {location}
})

export class EventPublishingRouter extends React.Component {
    static propTypes = {
        history: PropTypes.object.isRequired,
        children: PropTypes.node,
    }

    publishLocationChange = location => {
        location$.next(location)
    }

    componentWillMount() {
        history = this.props.history
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

import React from 'react'
import PropTypes from 'prop-types'
import QueryString from 'query-string'
import {Router} from 'react-router'
import Rx from 'rxjs'

const router = require('react-router-dom')

let historyInstance = null
export const history = () => historyInstance

export const location$ = new Rx.BehaviorSubject(null)
export const query = () => QueryString.parse(history().location.search)

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


export class EventPublishingRouter extends React.Component {
    static propTypes = {
        history: PropTypes.object.isRequired,
        children: PropTypes.node,
    }

    publishLocationChange = location => {
        location$.next(location)
    }

    componentWillMount() {
        historyInstance = this.props.history
        this.unsubscribeFromHistory = historyInstance.listen(this.publishLocationChange)
        this.publishLocationChange(historyInstance.location)
    }

    componentWillUnmount() {
        if (this.unsubscribeFromHistory) this.unsubscribeFromHistory()
    }

    render() {
        return <Router {...this.props} />
    }
}

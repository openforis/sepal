import React from 'react'
import QueryString from 'query-string'
import {Router} from 'react-router'
import {dispatch, state} from 'store'
import actionBuilder from 'action-builder'
import PropTypes from 'prop-types'

const router = require('react-router-dom')

let historyInstance = null
export const history = () => historyInstance

export const location = () => state().location

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

    publishLocationChange(location) {
        dispatch(
            actionBuilder('LOCATION_CHANGED')
                .set('location', location)
                .build()
        )
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

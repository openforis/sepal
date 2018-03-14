import React from 'react'
import QueryString from 'query-string'
import {state} from 'store'
import actionBuilder from 'action-builder'
import PropTypes from 'prop-types'

const router = require('react-router-dom')

let historyInstance = null
export const history = () => ({
    location: location(),

    push(pathname, state) {
        return actionBuilder('HISTORY_CHANGE')
            .set('historyOperation', {method: 'push', args: [pathname, state]})
            .set('location', {...location(), pathname: pathname, state: state})
            .build()
    },

    replace(pathname, state) {
        return actionBuilder('HISTORY_CHANGE')
            .set('historyOperation', {method: 'replace', args: [pathname, state]})
            .set('location', {...location(), pathname: pathname, state: state})
            .build()
    },

})

export const location = () => state().location

export const query = () => QueryString.parse(location().search)

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


function dispatchLocationChange(historyLocation) {
    const stateLocation = location() || {}
    if (stateLocation.pathname !== historyLocation.pathname)
        actionBuilder('LOCATION_CHANGED')
            .set('location', historyLocation)
            .dispatch()
}

export function syncHistoryAndStore(history, store) {
    historyInstance = history
    historyInstance.listen(dispatchLocationChange)
    dispatchLocationChange(history.location)
    store.subscribe(() => {
        const historyOperation = state().historyOperation
        if (historyOperation) {
            historyInstance[historyOperation.method](...historyOperation.args)
            actionBuilder('HISTORY_CHANGED', {notLogged: true})
                .del('historyOperation')
                .dispatch()
        }
    })
}

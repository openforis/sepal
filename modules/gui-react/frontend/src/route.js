import React from 'react'
import {Route as OriginalRoute, Switch as OriginalSwitch} from "react-router-dom"
import PropTypes from 'prop-types'

const renderMergedProps = (component, ...rest) => {
    return React.createElement(component, Object.assign({}, ...rest))
}

export const Route = ({component, ...rest}) => {
    return (
        <OriginalRoute {...rest} render={routeProps => {
            return renderMergedProps(component, routeProps, rest)
        }}/>
    )
}
Route.propTypes = {
    component: PropTypes.func.isRequired
}

export const Switch = OriginalSwitch
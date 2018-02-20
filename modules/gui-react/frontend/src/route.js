import React from 'react'
import PropTypes from 'prop-types'

const router = require('react-router-dom')
const reduxRouter = require('react-router-redux')

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
export const Link = router.Link
export const getLocation = reduxRouter.getLocation
export const push = reduxRouter.push
export const replace = reduxRouter.replace
export const go = reduxRouter.go
export const goBack = reduxRouter.goBack
export const goForward = reduxRouter.goForward
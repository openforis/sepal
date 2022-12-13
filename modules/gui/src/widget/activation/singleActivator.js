import {activationAllowed} from './activationPolicy'
import {collectActivatables} from './activation'
import {compose} from 'compose'
import {connect} from 'store'
import {isEqual} from 'hash'
import {withActivationContext} from './activationContext'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'
// import diff from 'deep-diff'

const mapStateToProps = (state, ownProps) => {
    const {activationContext: {pathList}} = ownProps
    const activatables = collectActivatables(state, pathList)
    return {activatables}
}

class _SingleActivator extends React.Component {
    shouldComponentUpdate({activatables: prevActivatables}) {
        const {activatables} = this.props
        if (isEqual(activatables, prevActivatables)) {
            // if (this.props.id === 'mapInfo') {
            // console.log('Activator skipped rerendering:', this.props.id)
            // }
            return false
        } else {
            // if (this.props.id === 'mapInfo') {
            // console.log('Activator rerendering:', this.props.id, diff(prevActivatables, activatables))
            // }
            return true
        }
    }

    render() {
        const {children} = this.props
        return children(this.getActivatorProps())
    }

    getActivatorProps() {
        const {id, activatables, activationContext: {pathList}} = this.props

        const activatablePath = id => activatables[id].path

        const activate = (id, activationProps) =>
            actionBuilder('ACTIVATE', {id, pathList})
                .assign(activatablePath(id), {
                    active: true,
                    justActivated: true,
                    activationProps
                })
                .dispatch()

        const deactivate = id =>
            actionBuilder('DEACTIVATE', {id, pathList})
                .assign(activatablePath(id), {
                    active: false,
                    justActivated: false
                })
                .dispatch()

        const isActive = id => activatables[id]?.active

        const canActivate = id => activationAllowed(id, activatables)

        const props = id => ({
            active: isActive(id),
            canActivate: canActivate(id),
            activate: activationProps => canActivate(id) && activate(id, activationProps),
            deactivate: () => isActive(id) && deactivate(id)
        })

        return props(id)
    }
}

export const SingleActivator = compose(
    _SingleActivator,
    connect(mapStateToProps),
    withActivationContext()
)

SingleActivator.propTypes = {
    children: PropTypes.func.isRequired,
    id: PropTypes.string.isRequired
}

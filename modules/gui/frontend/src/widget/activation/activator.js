import {activationAllowed} from './activationPolicy'
import {collectActivatables} from './activation'
import {connect} from 'store'
import {withActivationContext} from './activationContext'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'

const mapStateToProps = (state, ownProps) => {
    const {activationContext: {pathList}} = ownProps
    const activatables = collectActivatables(state, pathList)
    return {activatables}
}

class _Activator extends React.Component {
    render() {
        const {children} = this.props
        return children(this.getActivatorProps())
    }

    getActivatorProps() {
        const {id, ids, activatables, activationContext: {pathList}} = this.props
        if (id && ids) {
            throw Error('Cannot provide both id and ids props.')
        }
        
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

        const isActive = id => !!(activatables[id] || {}).active

        const canActivate = id => activationAllowed(id, activatables)

        const updateActivatables = updates =>
            _.reduce(updates,
                (actionBuilder, {id, active}) => {
                    const activatable = activatables[id]
                    if (!activatable || activatable.active !== active) {
                        const updatedActive = active && activationAllowed(id, activatables)
                        return actionBuilder.assign([pathList, 'activatables', {id}], {
                            active: updatedActive,
                            justActivated: updatedActive,
                        })
                    }
                    return actionBuilder
                }, actionBuilder('UPDATE_ACTIVATABLES', {pathList})
            ).dispatch()

        const props = id => ({
            active: isActive(id),
            canActivate: canActivate(id),
            activate: activationProps => canActivate(id) && activate(id, activationProps),
            deactivate: () => isActive(id) && deactivate(id)
        })

        return id
            ? props(id)
            : {
                activatables: _(activatables)
                    .keys()
                    .filter(activatableId => _.isEmpty(ids) || ids.includes(activatableId))
                    .transform((acc, id) => acc[id] = props(id), {})
                    .value(),
                updateActivatables
            }
    }
}

export const activator = (...ids) => {
    return WrappedComponent => {
        class HigherOrderComponent extends React.Component {
            render() {
                return (
                    <Activator ids={ids}>
                        {activator =>
                            React.createElement(WrappedComponent, {activator, ...this.props})}
                    </Activator>
                )
            }
        }

        return HigherOrderComponent
    }
}

export const Activator = (
    withActivationContext()(
        connect(mapStateToProps)(
            _Activator
        )
    )
)

Activator.propTypes = {
    children: PropTypes.func.isRequired,
    id: PropTypes.string,
    ids: PropTypes.array
}

import {activationAllowed} from 'widget/activation/activationPolicy'
import {connect} from 'store'
import {selectFrom} from 'collections'
import {withActivationContext} from './activationContext'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'

const mapStateToProps = (state, ownProps) => {
    const {activationContext: {statePath}} = ownProps
    return {activatables: selectFrom(state, [statePath, 'activatables']) || {}}
}

class UnconnectedActivator extends React.Component {
    render() {
        const {children} = this.props
        return children(this.getActivatorProps())
    }

    getActivatorProps() {
        const {id, activatables, activationContext: {statePath}} = this.props
        const activatablePath = id => [statePath, 'activatables', id]

        const activate = id =>
            actionBuilder('ACTIVATE', {id})
                .assign(activatablePath(id), {
                    active: true,
                    justActivated: true
                })
                .dispatch()

        const deactivate = id =>
            actionBuilder('DEACTIVATE', {id})
                .assign(activatablePath(id), {
                    active: false,
                    justActivated: false
                })
                .dispatch()

        const isActive = id => !!(activatables[id] || {}).active
        const canActivate = id => activationAllowed(id, activatables)

        const updateActivatables = updates => {
            const updatedActivatables = _.transform(updates, (activatables, {id, active}) => {
                const activatable = activatables[id]
                if (!activatable || activatable.active !== active) {
                    const updatedActive = active && activationAllowed(id, activatables)
                    activatable.active = updatedActive
                    activatable.justActivated = updatedActive
                }
            }, _.cloneDeep(activatables))
            if (!_.isEqual(updatedActivatables, activatables)) {
                actionBuilder('UPDATE_ACTIVATABLES')
                    .set([statePath, 'activatables'], updatedActivatables)
                    .dispatch()
            }
        }

        const props = id => ({
            active: isActive(id),
            canActivate: canActivate(id),
            activate: () => canActivate(id) && activate(id),
            deactivate: () => isActive(id) && deactivate(id),

        })
        const activatorProps =
            _(activatables)
                .keys()
                .transform((acc, id) => acc[id] = props(id), {})
                .value()
        return id
            ? props(id)
            : {
                activatables: activatorProps,
                updateActivatables
            }
    }
}

export const activator = (id) => {
    return WrappedComponent => {
        class HigherOrderComponent extends React.Component {
            render() {
                return (
                    <Activator id={id} {...this.props}>
                        {activatorProps =>
                            React.createElement(WrappedComponent, {...activatorProps, ...this.props})}
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
            UnconnectedActivator
        )
    )
)

Activator.propTypes = {
    children: PropTypes.func.isRequired,
    id: PropTypes.string
}

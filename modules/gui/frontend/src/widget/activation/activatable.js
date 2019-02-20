import actionBuilder from 'action-builder'
import {selectFrom} from 'collections'
import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import {withActivationContext} from 'widget/activation/activationContext'
import {shouldDeactivate} from 'widget/activation/activationPolicy'
import {Activator} from './activator'

const mapStateToProps = (state, ownProps) => {
    const {activationContext: {statePath}} = ownProps
    return {activatables: selectFrom(state, [statePath, 'activatables']) || {}}
}

class UnconnectedActivatable extends React.Component {
    render() {
        const {id, activatables, children} = this.props
        const currentActivatable = activatables[id] || {}
        return currentActivatable.active
            ? <Activator id={id}>{activatorProps => children({...this.props, ...activatorProps})}</Activator>
            : null
    }

    componentDidMount() {
        this.updateReduxStateIfChanged()
    }

    componentDidUpdate(prevProps) {
        this.updateReduxStateIfChanged()
    }

    updateReduxStateIfChanged() {
        const {id, policy, activatables} = this.props
        const currentActivatable = activatables[id] || {}
        const currentActive = currentActivatable.active
        const currentPolicy = currentActivatable.policy
        const justActivated = currentActivatable.justActivated
        const nextPolicy = policy ? policy(this.props) : {}
        const nextActive = currentActive && (justActivated || !shouldDeactivate(id, activatables, nextPolicy))
        const shouldUpdatePolicy = currentActive !== nextActive
            || !_.isEqual(currentPolicy, nextPolicy)
            || justActivated
        if (shouldUpdatePolicy) {
            this.updateReduxState(nextPolicy, nextActive)
        }
    }

    updateReduxState(nextPolicy, active) {
        const {id, activationContext: {statePath}} = this.props
        const activatable = {
            id,
            active: !!active,
            justActivated: false,
            policy: nextPolicy
        }

        actionBuilder('UPDATE_ACTIVATABLE', activatable)
            .set([statePath, 'activatables', id], activatable)
            .dispatch()
    }
}

export const Activatable = (
    withActivationContext()(
        connect(mapStateToProps)(
            UnconnectedActivatable
        )
    )
)

Activatable.propTypes = {
    id: PropTypes.string.isRequired,
    children: PropTypes.func.isRequired,
    policy: PropTypes.func
}

export const activatable = (id, policy) => {
    return WrappedComponent => {
        class HigherOrderComponent extends React.Component {
            render() {
                return (
                    <Activatable id={id} policy={policy} {...this.props}>
                        {activatableProps =>
                            React.createElement(
                                WrappedComponent,
                                {...activatableProps, ...this.props}
                            )
                        }
                    </Activatable>
                )
            }
        }

        return HigherOrderComponent
    }
}

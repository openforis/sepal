import {Activator} from './activator'
import {connect} from 'store'
import {selectFrom} from 'collections'
import {shouldDeactivate} from 'widget/activation/activationPolicy'
import {withActivationContext} from 'widget/activation/activationContext'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'

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

    componentDidUpdate() {
        this.updateReduxStateIfChanged()
    }

    componentWillUnmount() {
        const {id, activationContext: {statePath}} = this.props
        actionBuilder('REMOVE_ACTIVATABLE')
            .del([statePath, 'activatables', id])
            .dispatch()
    }

    updateReduxStateIfChanged() {
        const {id, policy, activatables, otherProps} = this.props
        const currentActivatable = activatables[id] || {}
        const currentActive = currentActivatable.active
        const currentPolicy = currentActivatable.policy
        const justActivated = currentActivatable.justActivated
        const nextPolicy = policy ? policy(otherProps) : undefined
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
    children: PropTypes.func.isRequired,
    id: PropTypes.string.isRequired,
    policy: PropTypes.func
}

export const activatable = (id, policy) => {
    return WrappedComponent => {
        class HigherOrderComponent extends React.Component {
            render() {
                return (
                    <Activatable id={id} policy={policy} otherProps={this.props}>
                        {activatable =>
                            React.createElement(
                                WrappedComponent,
                                {activatable, ...this.props}
                            )
                        }
                    </Activatable>
                )
            }
        }

        return HigherOrderComponent
    }
}

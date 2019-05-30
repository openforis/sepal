import {Activator} from './activator'
import {collectActivatables} from 'widget/activation/activation'
import {connect} from 'store'
import {shouldDeactivate} from 'widget/activation/activationPolicy'
import {withActivationContext} from 'widget/activation/activationContext'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'

const mapStateToProps = (state, ownProps) => {
    const {activationContext: {pathList}} = ownProps
    // return {activatables: collectActivatables(state, pathList)}
    return {activatables: collectActivatables(state, pathList)}
}

class _Activatable extends React.Component {
    render() {
        const {id, activatables, children} = this.props
        const currentActivatable = activatables[id] || {}
        return currentActivatable.active
            ? <Activator
                id={id}>{activatorProps => children({...this.props, ...activatorProps, ...currentActivatable.activationProps})}</Activator>
            : null
    }

    componentDidMount() {
        this.updateReduxStateIfChanged()
    }

    componentDidUpdate() {
        this.updateReduxStateIfChanged()
    }

    componentWillUnmount() {
        const {id, activationContext: {pathList}} = this.props
        actionBuilder('REMOVE_ACTIVATABLE')
            .del([pathList, 'activatables', id])
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
        const {id, activationContext: {pathList}, alwaysAllow} = this.props
        const activatable = {
            id,
            path: [...pathList, 'activatables', id],
            active: !!active,
            justActivated: false,
            policy: nextPolicy,
            alwaysAllow
        }

        actionBuilder('UPDATE_ACTIVATABLE', activatable)
            .merge([pathList, 'activatables', id], activatable)
            .dispatch()
    }
}

export const Activatable = (
    withActivationContext()(
        connect(mapStateToProps)(
            _Activatable
        )
    )
)

Activatable.propTypes = {
    children: PropTypes.func.isRequired,
    id: PropTypes.string.isRequired,
    policy: PropTypes.func
}

export const activatable = ({id, policy, alwaysAllow}) =>
    WrappedComponent =>
        class HigherOrderComponent extends React.Component {
            render() {
                const activatableId = _.isFunction(id) ? id(this.props) : id
                return (
                    <Activatable id={activatableId} policy={policy} alwaysAllow={alwaysAllow} otherProps={this.props}>
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

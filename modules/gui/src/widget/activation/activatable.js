import {collectActivatables} from 'widget/activation/activation'
import {compose} from 'compose'
import {connect} from 'store'
import {shouldDeactivate} from 'widget/activation/activationPolicy'
import {withActivationContext} from 'widget/activation/activationContext'
import {withActivators} from './activator'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'

const mapStateToProps = (state, ownProps) => {
    const {activationContext: {pathList}} = ownProps
    return {activatables: collectActivatables(state, pathList)}
}

class _Activatable extends React.Component {
    constructor() {
        super()
        this.renderActivator = this.renderActivator.bind(this)
    }

    render() {
        const {id, activatables} = this.props
        const currentActivatable = activatables[id] || {}
        return currentActivatable.active
            ? this.renderActivator()
            : null
    }

    renderActivator() {
        const {id, activatables, children, activator: {activatables: {activatable: {deactivate}}}} = this.props
        const {activationProps} = activatables[id] || {}
        return children({
            ...this.props,
            ...activationProps,
            deactivate
        })
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

const Activatable = compose(
    _Activatable,
    connect(mapStateToProps),
    withActivationContext(),
    withActivators({
        activatable: ({id}) => id
    })
)

Activatable.propTypes = {
    children: PropTypes.func.isRequired,
    id: PropTypes.string.isRequired,
    alwaysAllow: PropTypes.any,
    policy: PropTypes.func
}

export const activatable = ({id, policy, alwaysAllow}) =>
    WrappedComponent =>
        class ActivatableHOC extends React.Component {
            constructor() {
                super()
                this.renderActivatable = this.renderActivatable.bind(this)
            }

            render() {
                const activatableId = _.isFunction(id) ? id(this.props) : id
                return (
                    <Activatable
                        id={activatableId}
                        policy={policy}
                        alwaysAllow={alwaysAllow}
                        otherProps={this.props}>
                        {this.renderActivatable}
                    </Activatable>
                )
            }

            renderActivatable(activatable) {
                return React.createElement(WrappedComponent, {activatable, ...this.props})
            }
        }

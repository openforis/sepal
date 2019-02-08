import {connect, select} from 'store'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'

export const ActivationContext = ({statePath, children}) =>
    <Context.Provider value={{statePath}}>
        {children}
    </Context.Provider>

const withActivationContext = () =>
    WrappedComponent => {
        class HigherOrderComponent extends React.Component {
            render() {
                return (
                    <Context.Consumer>
                        {activationContext =>
                            React.createElement(WrappedComponent, {
                                ...this.props,
                                activationContext
                            })
                        }
                    </Context.Consumer>
                )
            }
        }

        return HigherOrderComponent
    }

export const coordinateActivation = (id, policy) =>
    WrappedComponent => {
        const mapStateToProps = (state, ownProps) => {
            const {activationContext: {statePath}} = ownProps
            const policies = select([statePath, 'policy']) || {}
            const policy = policies && policies[id]
            const active = !!(policy && policy.active)
            const justTriggered = !!(policy && policy.justTriggered)
            return {
                active,
                justTriggered,
                activeElements: Object.keys(policies).filter(elementId => policies[elementId].active),
            }
        }

        class HigherOrderComponent extends React.Component {
            render() {
                return this.props.active
                    ? React.createElement(WrappedComponent, this.props)
                    : null
            }

            componentDidMount() {
                this.updatePolicy()
            }

            componentDidUpdate() {
                this.updatePolicy()
            }

            componentWillUnmount() {
                this.removePolicy()
            }

            updatePolicy() {
                const policyToApply = policy(this.props)
                const shouldDeactivate = this.shouldDeactivate(policyToApply)
                const wasActive = this.props.active
                this.setPolicy(policyToApply, !shouldDeactivate && wasActive)
            }

            setPolicy(policy, active) {
                const {activationContext: {statePath}} = this.props
                const policyToSet = {...policy, active}
                return actionBuilder('UPDATE_POLICY', {id, policy})
                    .set([statePath, 'policy', id], policyToSet)
                    .set([statePath, 'policy', id, 'id'], id)
                    .set([statePath, 'policy', id, 'justTriggered'], false)
                    .dispatch()
            }

            removePolicy() {
                actionBuilder('REMOVE_POLICY', {id})
                    .del([this.props.activationContext.statePath, 'policy', id])
                    .dispatch()
            }

            shouldDeactivate(policy) {
                const {activeElements, active, justTriggered} = this.props
                return !!(
                    !justTriggered && active && activeElements
                        .filter(activeId => activeId !== id)
                        .find(activeId => policyDeactivates(activeId, policy))
                )
            }
        }

        return withActivationContext()(
            connect(mapStateToProps)(
                HigherOrderComponent
            )
        )
    }

export const policesAllowsActivation = (id, policies = {}) => {
    const policiesWithIds = _.mapValues(policies, (policy, id) => ({...policy, id}))
    const policy = policiesWithIds[id]

    // make sure an active element does not allow activation
    if (!policy || policy.active) return false

    const otherPolicies = Object.keys(policiesWithIds)
        .filter(elementId => elementId !== id)
        .map(elementId => policiesWithIds[elementId])
    const disallowsActivation = otherPolicies
        .filter(policy => policy.active)
        .find(otherActivePolicy => !policiesCompatible(policy, otherActivePolicy))
    return !disallowsActivation
}

const policiesCompatible = (policy, activePolicy) => {
    const otherActiveAllowActivation = policyAllowsActivation(policy.id, activePolicy)
    const otherActiveDeactivates = policyDeactivates(policy.id, activePolicy)
    const allowActivationOfOtherActive = policyAllowsActivation(activePolicy.id, policy)
    const deactivatesOtherActive = policyDeactivates(activePolicy.id, policy)
    return otherActiveAllowActivation && (otherActiveDeactivates ||
        (allowActivationOfOtherActive && !deactivatesOtherActive)
    )
}

const policyDeactivates = (activeId, policy) => {
    const {include, exclude} = policy.deactivateWhenActivated || {}
    if (include && exclude)
        throw Error('Both include and exclude section should not be specified ' +
            'in policy.deactivateWhenActivated')

    if (include) return include.includes(activeId)
    if (exclude) return !exclude.includes(activeId)
    return false
}

const policyAllowsActivation = (idToActivate, policy) => {
    const {include, exclude} = policy.othersCanActivate || {}
    if (include && exclude)
        throw Error('Both include and exclude section should not be specified ' +
            'in policy.othersCanActivate')

    if (include) return include.includes(idToActivate)
    if (exclude) return !exclude.includes(idToActivate)
    return true
}

export const withActivationStatus = (id) => {
    return WrappedComponent => {

        const mapStateToProps = (state, ownProps) => {
            const {activationContext: {statePath}} = ownProps
            const policies = select([statePath, 'policy'])
            const active = !!(policies && policies[id].active)
            const canActivate = policesAllowsActivation(id, policies)
            return {
                active,
                canActivate,
                activate: () => {
                    return canActivate && actionBuilder('ACTIVATE')
                        .set([statePath, 'policy', id, 'active'], true)
                        .set([statePath, 'policy', id, 'justTriggered'], true)
                        .dispatch()},
                deactivate: () =>
                    active && actionBuilder('DEACTIVATE')
                        .set([statePath, 'policy', id, 'active'], false)
                        .dispatch()
                ,
            }
        }

        return withActivationContext()(
            connect(mapStateToProps)(
                WrappedComponent
            )
        )
    }
}

const Context = React.createContext()

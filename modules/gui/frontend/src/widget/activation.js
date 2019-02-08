import actionBuilder from 'action-builder'
import React from 'react'
import {connect, select} from 'store'

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
                const policyToSet = active ? {...policy, active} : {active}
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

const policesAllowsActivation = (id, policies = {}) => {
    const policy = policies[id]
    const otherPolicies = Object.keys(policies)
        .filter(elementId => elementId !== id)
        .map(elementId => policies[elementId])
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
    console.log({activeId, policy})
    const {include, exclude} = policy.deactivateWhenActivated || {}
    if (include && exclude)
        throw Error('Both include and exclude section should not be specified ' +
            'in policy.deactivateWhenActivated')
    const included = include && include.includes(activeId)
    const excluded = exclude && exclude.includes(activeId)
    return included || !excluded
}

const policyAllowsActivation = (idToActivate, policy) => {
    const {include, exclude} = policy.othersCanActivate || {}
    if (include && exclude)
        throw Error('Both include and exclude section should not be specified ' +
            'in policy.othersCanActivate')

    const included = include && include.includes(idToActivate)
    const excluded = exclude && exclude.includes(idToActivate)
    return included || !excluded
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
                activate: () =>
                    canActivate && actionBuilder('ACTIVATE')
                        .set([statePath, 'policy', id, 'active'], true)
                        .set([statePath, 'policy', id, 'justTriggered'], true)
                        .dispatch(),
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

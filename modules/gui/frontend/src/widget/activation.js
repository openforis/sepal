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

            policyPath() {
                const {activationContext: {statePath}} = this.props
                return [statePath, 'policy', id]
            }

            shouldDeactivate(policy) {
                const {activeElements, active, justTriggered} = this.props
                return active && !justTriggered
                    && _(activeElements)
                        .filter(activeId => activeId !== id)
                        .some(activeId => shouldDeactivate(activeId, policy))
            }

            updatePolicy() {
                const {active} = this.props
                const policyToApply = policy(this.props)
                this.setPolicy(policyToApply, active && !this.shouldDeactivate(policyToApply))
            }

            setPolicy(policy, active) {
                actionBuilder('UPDATE_POLICY', {id, policy})
                    .set(this.policyPath(), {
                        ...policy,
                        active,
                        justTriggered: false
                    })
                    .dispatch()
            }

            removePolicy() {
                actionBuilder('REMOVE_POLICY', {id})
                    .del(this.policyPath())
                    .dispatch()
            }
        }

        return withActivationContext()(
            connect(mapStateToProps)(
                HigherOrderComponent
            )
        )
    }

export const policesAllowActivation = (id, policies = {}) => {
    const [[ownPolicy], otherPolicies] = _(policies)
        .mapValues((policy, id) => ({...policy, id}))
        .partition(policy => policy.id === id)
        .value()

    return ownPolicy && !ownPolicy.active
        ? _(otherPolicies)
            .pickBy(policy => policy.active)
            .every(otherPolicy => policiesCompatible(ownPolicy, otherPolicy))
        : false
}

const policiesCompatible = (ownPolicy, otherPolicy) => {
    const canThisElementBeActivatedByOtherElement = canActivate(ownPolicy.id, otherPolicy)
    const shouldOtherElementByDeactivatedByThisElement = shouldDeactivate(ownPolicy.id, otherPolicy)

    const canOtherElementBeActivatedByThisElement = canActivate(otherPolicy.id, ownPolicy) && !shouldDeactivate(otherPolicy.id, ownPolicy)
    return canThisElementBeActivatedByOtherElement
        && (shouldOtherElementByDeactivatedByThisElement || canOtherElementBeActivatedByThisElement)
}

const canActivate = (id, policy) => {
    const {include, exclude} = policy.othersCanActivate || {}
    if (include && exclude)
        throw Error('Policy include and exclude options are mutually exclusive')
    if (include) return include.includes(id)
    if (exclude) return !exclude.includes(id)
    return true
}

const shouldDeactivate = (id, policy) => {
    const {include, exclude} = policy.deactivateWhenActivated || {}
    if (include && exclude)
        throw Error('Policy include and exclude options are mutually exclusive')
    if (include) return include.includes(id)
    if (exclude) return !exclude.includes(id)
    return false
}

export const withActivationStatus = (id) => {
    return WrappedComponent => {

        const mapStateToProps = (state, ownProps) => {
            const {activationContext: {statePath}} = ownProps
            const policies = select([statePath, 'policy'])
            const active = !!(policies && policies[id] && policies[id].active)
            const canActivate = policesAllowActivation(id, policies)
            return {
                active,
                canActivate,
                activate: () => canActivate && activate([statePath, 'policy', id]),
                deactivate: () => active && deactivate([statePath, 'policy', id])
            }
        }

        const activate = (policyPath) =>
            actionBuilder('ACTIVATE', {id})
                .assign(policyPath, {
                    active: true,
                    justTriggered: true
                })
                .dispatch()

        const deactivate = (policyPath) =>
            actionBuilder('DEACTIVATE', {id})
                .assign(policyPath, {
                    active: false
                })
                .dispatch()

        return withActivationContext()(
            connect(mapStateToProps)(
                WrappedComponent
            )
        )
    }
}

const Context = React.createContext()

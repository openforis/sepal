import actionBuilder from 'action-builder'
import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {connect, select} from 'store'

export const ActivationContext = ({statePath, children}) =>
    <Context.Provider value={{statePath}}>
        {children}
    </Context.Provider>

const withActivationContext = () => {
    return WrappedComponent => {
        class HigherOrderComponent extends React.Component {
            render() {
                return (
                    <Context.Consumer>
                        {activationContext => {
                            if (!activationContext)
                                throw new Error(`Component has no ActivationContext: ${WrappedComponent}`)
                            return React.createElement(WrappedComponent, {
                                ...this.props,
                                activationContext
                            })
                        }}
                    </Context.Consumer>
                )
            }
        }

        return HigherOrderComponent
    }
}

const getActivatableProps = (statePath, id) => {
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


class ActivatableWrapper extends React.Component {
    render() {
        const {id, active, children} = this.props
        return active
            ? <Activator id={id}>{props => children(props)}</Activator>
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
        const {id, activationContext: {statePath}} = this.props
        return [statePath, 'policy', id]
    }

    shouldDeactivate(policy) {
        const {id, activeElements, active, justTriggered} = this.props
        if (justTriggered)
            return active && !justTriggered
                && _(activeElements)
                    .filter(activeId => activeId !== id)
                    .some(activeId => deactivateWhen(activeId, policy))
    }

    updatePolicy() {
        const {active, policy} = this.props
        const policyToApply = policy ? policy(this.props) : {}
        this.setPolicy(policyToApply, active && !this.shouldDeactivate(policyToApply))
    }

    setPolicy(policy, active) {
        const {id} = this.props
        actionBuilder('UPDATE_POLICY', {id, policy})
            .set(this.policyPath(), {
                ...policy,
                active,
                justTriggered: false
            })
            .dispatch()
    }

    removePolicy() {
        const {id} = this.props
        actionBuilder('REMOVE_POLICY', {id})
            .del(this.policyPath())
            .dispatch()
    }
}


export const activatable = (id, policy) => {
    const mapStateToProps = (state, ownProps) => {
        const {activationContext: {statePath}} = ownProps
        return getActivatableProps(statePath, id)
    }

    return WrappedComponent => {
        class HigherOrderComponent extends React.Component {
            render() {
                return (
                    <ActivatableWrapper id={id} policy={policy} {...this.props}>
                        {props => React.createElement(WrappedComponent, {...this.props, ...props})}
                    </ActivatableWrapper>
                )

            }
        }

        return withActivationContext()(
            connect(mapStateToProps)(
                HigherOrderComponent
            )
        )
    }
}


export const Activatable = ({id, policy, children}) =>
    <Context.Consumer>
        {activationContext => {
            const activatableProps = getActivatableProps(activationContext.statePath, id)
            return (
                <ActivatableWrapper
                    id={id}
                    policy={policy}
                    activationContext={activationContext}
                    {...activatableProps}>
                    {activatorProps =>
                        children({
                            ...activatorProps,
                            ...activatableProps
                        })}
                </ActivatableWrapper>
            )
        }
        }
    </Context.Consumer>

Activatable.propTypes = {
    id: PropTypes.string.isRequired,
    children: PropTypes.func.isRequired,
    policy: PropTypes.func
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

const policiesCompatible = (thisPolicy, otherPolicy) => {
    const thisCompatibleWithOther = compatibleWith(thisPolicy.id, otherPolicy)
    const otherCompatibleWithThis = compatibleWith(otherPolicy.id, thisPolicy)

    const otherShouldDeactivate = deactivateWhen(thisPolicy.id, otherPolicy)
    const thisShouldDeactivate = deactivateWhen(otherPolicy.id, thisPolicy)

    return (thisCompatibleWithOther && otherShouldDeactivate)
        || (thisCompatibleWithOther && otherCompatibleWithThis && !thisShouldDeactivate)
}

const compatibleWith = (id, policy) => {
    const {include, exclude} = policy.compatibleWith || {}
    if (include && exclude)
        throw Error('Policy include and exclude options are mutually exclusive')
    if (include) return include.includes(id)
    if (exclude) return !exclude.includes(id)
    return true
}

const deactivateWhen = (id, policy) => {
    const {include, exclude} = policy.deactivateWhen || {}
    if (include && exclude)
        throw Error('Policy include and exclude options are mutually exclusive')
    if (include) return include.includes(id)
    if (exclude) return !exclude.includes(id)
    return false
}

const getActivatorProps = (statePath, id) => {
    const activate = (id, policyPath) => {
        return actionBuilder('ACTIVATE', {id})
            .assign(policyPath, {
                active: true,
                justTriggered: true
            })
            .dispatch()
    }

    const deactivate = (id, policyPath) =>
        actionBuilder('DEACTIVATE', {id})
            .assign(policyPath, {
                active: false
            })
            .dispatch()

    const getPolicies = () => select([statePath, 'policy']) || {}
    const isActive = id => !!(getPolicies()[id] || {}).active
    const canActivate = id => policesAllowActivation(id, getPolicies())

    const props = id => ({
        active: isActive(id),
        canActivate: canActivate(id),
        activate: () => canActivate(id) && activate(id, [statePath, 'policy', id]),
        deactivate: () => isActive(id) && deactivate(id, [statePath, 'policy', id]),

    })
    return id
        ? props(id)
        : {
            activatables: _.transform(
                Object.keys(getPolicies()),
                (acc, id) => acc[id] = props(id), {})
        }
}

export const activator = (id) => {
    const mapStateToProps = (state, ownProps) => {
        const {activationContext: {statePath}} = ownProps
        return getActivatorProps(statePath, id)
    }

    return WrappedComponent =>
        withActivationContext()(
            connect(mapStateToProps)(
                WrappedComponent
            )
        )
}

export const Activator = ({id, children}) =>
    <Context.Consumer>
        {({statePath}) => children(getActivatorProps(statePath, id))}
    </Context.Consumer>

Activator.propTypes = {
    id: PropTypes.string.isRequired,
    children: PropTypes.func.isRequired
}

const Context = React.createContext()

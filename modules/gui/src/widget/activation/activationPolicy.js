const VALID_BEHAVIORS = ['disallow', 'allow', 'allow-then-deactivate']
const DEFAULT_POLICY = {_: 'allow'}

const assertFallbackPolicy = activatables =>
    Object.values(activatables)
        .forEach(activatable => {
            if (activatable.policy && !activatable.policy._) {
                throw Error(`Policy '${activatable.id}' is missing fallback behavior: ${activatable.policy}`)
            }
        })

const isActive = activatable =>
    activatable?.active

const isAlwaysAllowed = activatable =>
    activatable?.alwaysAllow

const getPolicy = activatable => activatable.policy || DEFAULT_POLICY

const isPolicyCompatible = (thisActivatable, otherActivatable) => {
    const thisPolicy = getPolicy(thisActivatable)
    const otherPolicy = getPolicy(otherActivatable)
    if (isAlwaysAllowed(thisActivatable) || isAlwaysAllowed(otherActivatable)) {
        return true
    }
    const thisCompatibleWithOther = isAllowed(thisActivatable.id, otherPolicy)
    const otherCompatibleWithThis = isAllowed(otherActivatable.id, thisPolicy)
    const otherShouldDeactivate = isRequiringDeactivation(thisActivatable.id, otherPolicy)
    const thisShouldDeactivate = isRequiringDeactivation(otherActivatable.id, thisPolicy)
    return thisCompatibleWithOther
        && (otherShouldDeactivate || (otherCompatibleWithThis && !thisShouldDeactivate))
}

const getOtherActiveActivatables = (activatables, activatable) =>
    Object.values(activatables)
        .filter(otherActivatable => otherActivatable !== activatable && otherActivatable.active)

const arePoliciesCompatible = (activatables, activatable) =>
    getOtherActiveActivatables(activatables, activatable)
        .every(otherActivatable => isPolicyCompatible(activatable, otherActivatable))

const validateBehavior = behavior => {
    if (!VALID_BEHAVIORS.includes(behavior)) {
        throw Error(`Invalid policy behavior: ${behavior}`)
    }
    return behavior
}

const behavior = (id, policy) =>
    validateBehavior(policy[id] || policy._)

const isAllowed = (id, policy) =>
    behavior(id, policy) !== 'disallow'

const isRequiringDeactivation = (id, policy) =>
    behavior(id, policy) === 'allow-then-deactivate'

const isDeactivatable = (activatable, otherActivatable) =>
    isActive(activatable) && (!isAlwaysAllowed(activatable) || isAlwaysAllowed(otherActivatable))

export const activationAllowed = (id, activatables = {}) => {
    assertFallbackPolicy(activatables)
    const activatable = activatables[id]
    if (isActive(activatable)) {
        return false
    }
    if (isAlwaysAllowed(activatable)) {
        return true
    }
    return arePoliciesCompatible(activatables, activatable)
}
    
export const shouldDeactivate = (id, activatables = {}, nextPolicy) =>
    Object.values(activatables)
        .filter(activatable => activatable.id !== id && isDeactivatable(activatable, activatables[id]))
        .some(activatable => isRequiringDeactivation(activatable.id, nextPolicy))

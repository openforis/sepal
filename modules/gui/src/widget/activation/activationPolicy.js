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

const validateBehavior = behavior => {
    if (!VALID_BEHAVIORS.includes(behavior)) {
        throw Error(`Invalid policy behavior: ${behavior}`)
    }
    return behavior
}

const behavior = (id, policy) =>
    validateBehavior(policy[id] || policy._)

const isCompatibleWith = (id, policy) =>
    behavior(id, policy) !== 'disallow'

const isRequiringDeactivation = (id, policy) =>
    behavior(id, policy) === 'allow-then-deactivate'

const isPolicyCompatible = (thisActivatable, otherActivatable) => {
    if ((isAlwaysAllowed(thisActivatable) || isAlwaysAllowed(otherActivatable))) {
        return true
    }
    const thisPolicy = getPolicy(thisActivatable)
    const otherPolicy = getPolicy(otherActivatable)
    const thisCompatibleWithOther = isCompatibleWith(thisActivatable.id, otherPolicy)
    const otherCompatibleWithThis = isCompatibleWith(otherActivatable.id, thisPolicy)
    const otherShouldDeactivate = isRequiringDeactivation(thisActivatable.id, otherPolicy)
    const thisShouldDeactivate = isRequiringDeactivation(otherActivatable.id, thisPolicy)
    return thisCompatibleWithOther && (otherShouldDeactivate || (otherCompatibleWithThis && !thisShouldDeactivate))
}

export const activationAllowed = (id, activatables = {}) => {
    assertFallbackPolicy(activatables)
    const thisActivatable = activatables[id]
    if (!thisActivatable || isActive(thisActivatable)) {
        return false
    }
    if (isAlwaysAllowed(thisActivatable)) {
        return true
    }
    return Object.values(activatables)
        .filter(({id: otherActivatableId, active}) => otherActivatableId !== id && active)
        .every(otherActivatable => isPolicyCompatible(thisActivatable, otherActivatable))
}

const isDeactivatable = (activatables, id, otherActivatableId) =>
    isActive(activatables[otherActivatableId])
        && (!isAlwaysAllowed(activatables[otherActivatableId]) || isAlwaysAllowed(activatables[id]))

export const shouldDeactivate = (id, activatables = {}, nextPolicy) =>
    Object.keys(activatables)
        .filter(activeId => activeId !== id)
        .filter(activatableId => isDeactivatable(activatables, id, activatableId))
        .some(activeId => isRequiringDeactivation(activeId, nextPolicy))

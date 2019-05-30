import _ from 'lodash'

const VALID_BEHAVIORS = ['disallow', 'allow', 'allow-then-deactivate']
const DEFAULT_POLICY = {_: 'allow'}

const assertFallbackPolicy = activatable => {
    if (activatable.policy && !activatable.policy._) {
        throw Error(`Policy '${activatable.id}' is missing fallback behavior: ${activatable.policy}`)
    }
}

export const activationAllowed = (id, activatables = {}) => {
    _(activatables)
        .values()
        .forEach(activatable => assertFallbackPolicy(activatable))

    const [[thisActivatable], otherActivatables] =
        _(activatables)
            .mapValues((activatable, id) => ({...activatable, id}))
            .partition(activatable => activatable.id === id)
            .value()

    return thisActivatable && !thisActivatable.active
        ? thisActivatable.alwaysAllow || _(otherActivatables)
            .pickBy(otherActivatable => otherActivatable.active)
            .every(otherActivatable => policiesCompatible(thisActivatable, otherActivatable))
        : false
}

const getPolicy = activatable => activatable.policy || DEFAULT_POLICY

const policiesCompatible = (thisActivatable, otherActivatable) => {
    const thisPolicy = getPolicy(thisActivatable)
    const otherPolicy = getPolicy(otherActivatable)
    const thisCompatibleWithOther = compatibleWith(thisActivatable.id, otherPolicy)
    const otherCompatibleWithThis = compatibleWith(otherActivatable.id, thisPolicy)
    const otherShouldDeactivate = deactivateWhen(thisActivatable.id, otherPolicy)
    const thisShouldDeactivate = deactivateWhen(otherActivatable.id, thisPolicy)
    return thisCompatibleWithOther
        && (otherShouldDeactivate || (otherCompatibleWithThis && !thisShouldDeactivate))
}

const validateBehavior = behavior => {
    if (!VALID_BEHAVIORS.includes(behavior)) {
        throw Error(`Invalid policy behavior: ${behavior}`)
    }
    return behavior
}

const behavior = (id, policy) =>
    validateBehavior(policy[id] || policy._)

const compatibleWith = (id, policy) =>
    behavior(id, policy) !== 'disallow'

const deactivateWhen = (id, policy) =>
    behavior(id, policy) === 'allow-then-deactivate'

export const shouldDeactivate = (id, activatables = {}, nextPolicy) =>
    _(activatables)
        .keys()
        .filter(activatableId => activatables[activatableId].active && !activatables[activatableId].alwaysAllow)
        .filter(activeId => activeId !== id)
        .some(activeId => deactivateWhen(activeId, nextPolicy))

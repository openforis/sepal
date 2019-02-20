import _ from 'lodash'

export const activationAllowed = (id, activatables = {}) => {
    const [[activatable], otherActivatables] =
        _(activatables)
            .mapValues((activatable, id) => ({...activatable, id}))
            .partition(activatable => activatable.id === id)
            .value()

    return activatable && !activatable.active
        ? _(otherActivatables)
            .pickBy(otherActivatable => otherActivatable.active)
            .every(otherActivatable => policiesCompatible(activatable, otherActivatable))
        : false
}

export const shouldDeactivate = (id, activatables = {}, nextPolicy) =>
    _(activatables)
        .keys()
        .filter(activatableId => activatables[activatableId].active)
        .filter(activeId => activeId !== id)
        .some(activeId => deactivateWhen(activeId, nextPolicy))

const policiesCompatible = (activatable, otherActivatable) => {
    const thisCompatibleWithOther = compatibleWith(activatable.id, otherActivatable.policy)
    const otherCompatibleWithThis = compatibleWith(otherActivatable.id, activatable.policy)

    const otherShouldDeactivate = deactivateWhen(activatable.id, otherActivatable.policy)
    const thisShouldDeactivate = deactivateWhen(otherActivatable.id, activatable.policy)

    return (thisCompatibleWithOther && otherShouldDeactivate)
        || (thisCompatibleWithOther && otherCompatibleWithThis && !thisShouldDeactivate)
}

const compatibleWith = (id, policy = {}) => {
    const {include, exclude} = policy.compatibleWith || {}
    if (include && exclude)
        throw Error('Policy include and exclude options are mutually exclusive')
    if (include) return include.includes(id)
    if (exclude) return !exclude.includes(id)
    return true
}

const deactivateWhen = (id, policy = {}) => {
    const {include, exclude} = policy.deactivateWhen || {}
    if (include && exclude)
        throw Error('Policy include and exclude options are mutually exclusive')
    if (include) return include.includes(id)
    if (exclude) return !exclude.includes(id)
    return false
}


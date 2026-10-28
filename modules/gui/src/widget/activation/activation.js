import _ from 'lodash'

import {selectFrom} from '~/stateUtils'

const parentPathList = pathList =>
    pathList.slice(0, -2)

// Every connected Activator and Activatable collects on each store notification, nearly always from an activation state
// that did not change. That state is replaced whenever it changes, so a collection holds for as long as it is the same
// object, per context: the path is encoded whole, since a context id may contain any delimiter.
const COLLECTED = new WeakMap()

export const collectActivatables = (state, pathList) => {
    const activation = state?.[pathList[0]]
    if (!activation || typeof activation !== 'object') {
        return collect(state, pathList)
    }
    const collected = COLLECTED.get(activation) || new Map()
    COLLECTED.set(activation, collected)
    const key = JSON.stringify(pathList)
    if (!collected.has(key)) {
        collected.set(key, collect(state, pathList))
    }
    return collected.get(key)
}

const collect = (state, pathList) => {
    const selectActivatables = pathList =>
        selectFrom(state, [pathList, 'activatables'])

    const childrenActivatables = pathList => {
        const childContexts = selectFrom(state, [pathList, 'contexts'])
        return _(childContexts)
            .mapValues((childContext, id) => ({
                ...childrenActivatables([pathList, 'contexts', id]),
                ...childContext.activatables
            }))
            .values()
            .reduce((acc, activatables) => ({...acc, ...activatables}), {})

    }

    const parentActivatables = pathList => {
        const parent = parentPathList(pathList)
        return parent.length > 2
            ? {...parentActivatables(parent), ...selectActivatables(parent)}
            : {} // pathList points to root, which has no parents
    }

    return {
        ...parentActivatables(pathList),
        ...childrenActivatables(pathList),
        ...selectActivatables(pathList),
    }
}

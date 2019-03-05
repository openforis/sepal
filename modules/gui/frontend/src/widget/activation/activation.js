import {selectFrom} from 'collections'
import _ from 'lodash'

const parentPathList = pathList =>
    pathList.slice(0, -2)


export const collectActivatables = (state, pathList) => {
    // console.log('collectActivatables')
    const selectActivatables = pathList => {
        return selectFrom(state, [pathList, 'activatables'])
    }

    const childrenActivatables = (pathList) => {
        const childContexts = selectFrom(state, [pathList, 'contexts'])
        return _(childContexts)
            .mapValues((childContext, id) => ({
                ...childrenActivatables([pathList, 'contexts', id]),
                ...childContext.activatables
            }))
            .values()
            .reduce((acc, activatables) => ({...acc, ...activatables}), {})

    }

    const parentActivatables = (pathList) => {
        const parent = parentPathList(pathList)
        if (parent.length < 3)
            return {} // pathList points to root, which has no parents
        return {...parentActivatables(parent), ...selectActivatables(parent)}
    }

    const activatables = {
        ...parentActivatables(pathList),
        ...childrenActivatables(pathList),
        ...selectActivatables(pathList),
    }

    return activatables
}

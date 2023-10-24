import {deps} from './config.js'
import _ from 'lodash'

export const getLibDeps = module =>
    (deps[module] || {}).lib || []

export const getBuildDeps = module =>
    _((deps[module] || {}).build || [])
        .keys()
        .value()

export const getBuildRunDeps = module =>
    _((deps[module] || {}).build || [])
        .pickBy((type, _dep) => type === 'run')
        .keys()
        .value()

export const getDirectRunDeps = module =>
    (deps[module] || {}).run || []

export const getInverseRunDeps = module =>
    _(deps)
        .pickBy(({run}) => run && run.includes(module))
        .keys()
        .value()

export const getLibDepList = modules =>
    _(modules)
        .map(module => getLibDeps(module))
        .flatten()
        .uniq()
        .value()
    
export const getDirectRunDepList = (modules, recursive) => {
    const dependencies = recursive
        ? _.flatten(
            modules.map(
                module => getDirectRunDepList(getDirectRunDeps(module), recursive)
            )
        )
        : []

    return [
        ...dependencies,
        ...modules
    ]
}

export const getRunDependencyMap = modules =>
    _.reduce(modules, (dependencyMap, module) => {
        if (dependencyMap[module]) {
            return dependencyMap
        } else {
            const moduleDependencies = getDirectRunDeps(module)
            return {
                ...dependencyMap,
                [module]: moduleDependencies,
                ...getRunDependencyMap(moduleDependencies)
            }
        }
    }, {})

export const isWatchable = module =>
    deps[module]?.watch

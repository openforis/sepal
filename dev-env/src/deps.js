import {deps} from './config.js'
import _ from 'lodash'

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

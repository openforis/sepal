import {compose} from './compose.js'
import {getModules, isModule, isRunnable, showModuleStatus, showStatus, MESSAGE} from './utils.js'
import {getDirectRunDeps} from './deps.js'
import _ from 'lodash'

export const stopModule = async (module, options = {}, _parent) => {
    if (isModule(module)) {
        if (isRunnable(module)) {
            showModuleStatus(module, MESSAGE.STOPPING, {sameLine: true})
            await compose({
                module,
                command: 'down',
                showStdOut: options.verbose
            })
            await showStatus([module])
        } else {
            showModuleStatus(module, MESSAGE.NON_RUNNABLE)
        }
    }
}

const getModulesToStop = (modules, options = {}, parentModules = []) => {
    const dependencies = options.dependencies
        ? _.flatten(
            modules.map(module =>
                getModulesToStop(getDirectRunDeps(module), options, _.uniq([...parentModules, ...modules]))
            )
        )
        : []

    return [
        ...modules,
        ...dependencies
    ]
}

export const stop = async (modules, options) => {
    const stopActions = _.uniq(getModulesToStop(getModules(modules), options))
    for (const module of stopActions) {
        await stopModule(module, _.pick(options, ['verbose', 'quiet']))
    }
}

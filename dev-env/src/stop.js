import _ from 'lodash'

import {compose} from './compose.js'
import {getDirectRunDeps} from './deps.js'
import {getModules, isModule, isRunnable, MESSAGE, multi, showModuleStatus, showStatus} from './utils.js'

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
    const modulesToStop = _.uniq(getModulesToStop(getModules(modules), options))
    await multi(modulesToStop, async module => await stopModule(module, _.pick(options, ['verbose', 'quiet'])), options.sequential)
}

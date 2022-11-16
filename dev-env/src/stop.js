import {exec} from './exec.js'
import {getModules, isModule, isRunnable, showModuleStatus, showStatus, MESSAGE} from './utils.js'
import {getDirectRunDeps} from './deps.js'
import {SEPAL_SRC, ENV_FILE} from './config.js'
import {log} from './log.js'
import _ from 'lodash'

export const stopModule = async (module, options = {}, _parent) => {
    try {
        if (isModule(module)) {
            if (isRunnable(module)) {
                showModuleStatus(module, MESSAGE.STOPPING, {sameLine: true})
                await exec({
                    command: './script/docker-compose-down.sh',
                    args: [module, SEPAL_SRC, ENV_FILE],
                    showStdOut: options.verbose
                })
                await showStatus([module])
            } else {
                showModuleStatus(module, MESSAGE.NON_RUNNABLE)
            }
        }
    } catch (error) {
        showModuleStatus(module, MESSAGE.ERROR)
        log.error(error.stderr || error)
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

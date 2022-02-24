import {exec} from './exec.js'
import {exit, getModules, isModule, isRunnable, showModuleStatus, showStatus, STATUS} from './utils.js'
import {getDirectRunDeps} from './deps.js'
import {SEPAL_SRC, ENV_FILE} from './config.js'
import _ from 'lodash'

const startModule = async (module, options = {}, _parent) => {
    try {
        if (isModule(module)) {
            if (isRunnable(module)) {
                showModuleStatus(module, STATUS.STARTING)
                await exec({
                    command: './script/docker-compose-up.sh',
                    args: [module, SEPAL_SRC, ENV_FILE],
                    showStdOut: options.verbose
                })
                await showStatus([module], {extended: true})
            } else {
                showModuleStatus(module, STATUS.NON_RUNNABLE)
            }
        }
    } catch (error) {
        showModuleStatus(module, STATUS.ERROR)
        exit({error})
    }
}

const getModulesToStart = (modules, options = {}, parentModules = []) => {
    const dependencies = options.dependencies
        ? _.flatten(
            modules.map(module =>
                parentModules.includes(module)
                    ? []
                    : getModulesToStart(getDirectRunDeps(module), options, _.uniq([...parentModules, ...modules]))
            )
        )
        : []

    return [
        ...dependencies,
        ...modules
    ]
}

export const start = async (modules, options) => {
    const startModules = _.uniq(getModulesToStart(getModules(modules), options))
    for (const module of startModules) {
        await startModule(module, _.pick(options, ['verbose', 'quiet']))
    }
}

import {exec} from './exec.js'
import {stopModule} from './stop.js'
import {exit, getModules, isModule, isRunnable, isRunning, showModuleStatus, showStatus, STATUS} from './utils.js'
import {getDirectRunDeps} from './deps.js'
import {SEPAL_SRC, ENV_FILE} from './config.js'
import {log} from './log.js'
import _ from 'lodash'

const startModule = async (module, options = {}, _parent) => {
    try {
        if (isModule(module)) {
            if (isRunnable(module)) {
                if (!await isRunning(module)) {
                    showModuleStatus(module, STATUS.STARTING)
                    await exec({
                        command: './script/docker-compose-up.sh',
                        args: [module, SEPAL_SRC, ENV_FILE],
                        showStdOut: options.verbose
                    })
                }
                await showStatus([module], options)
            } else {
                showModuleStatus(module, STATUS.NON_RUNNABLE)
            }
        }
    } catch (error) {
        showModuleStatus(module, STATUS.ERROR)
        exit({error})
    }
}

const getStartActions = (modules, options = {}, parent) => {
    const startActions = modules.map(
        module => ({module, action: 'start'})
    )
    const depActions = _.flatten(
        modules.map(
            module => getStartActions(getDirectRunDeps(module), options, module)
        )
    )
    return [
        ...depActions,
        ...startActions
    ]
}

export const start = async (modules, options) => {
    const startActions = _(getStartActions(getModules(modules), options))
        .uniqWith(_.isEqual)
        .value()

    for (const {module, action} of startActions) {
        if (action === 'start') {
            await startModule(module, _.pick(options, ['verbose', 'quiet']))
        } else if (action === 'stop') {
            await stopModule(module, _.pick(options, ['verbose', 'quiet']))
        } else {
            log.error('Unsupported action:', action)
        }
    }
}

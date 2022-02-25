import {exec} from './exec.js'
import {exit, isModule, isRunnable, showModuleStatus, MESSAGE} from './utils.js'
import {SEPAL_SRC, ENV_FILE} from './config.js'
import _ from 'lodash'

const logsModule = async (module, options = {}, _parent) => {
    try {
        if (isModule(module)) {
            if (isRunnable(module)) {
                const logsOptions = _.compact([
                    options.follow ? '--follow' : null
                ]).join(' ')
                await exec({
                    command: './script/docker-compose-logs.sh',
                    args: [module, SEPAL_SRC, ENV_FILE, logsOptions],
                    showStdOut: true
                })
            } else {
                showModuleStatus(module, MESSAGE.NON_RUNNABLE)
            }
        }
    } catch (error) {
        showModuleStatus(module, MESSAGE.ERROR)
        exit({error})
    }
}

export const logs = async (module, options) => {
    await logsModule(module, options)
}

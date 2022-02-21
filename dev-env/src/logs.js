import {exec} from './exec.js'
import {exit, isModule, isRunnable, isRunning, showModuleStatus, STATUS} from './utils.js'
import {SEPAL_SRC, ENV_FILE} from './config.js'
import _ from 'lodash'

const logsModule = async (module, options = {}, _parent) => {
    try {
        if (isModule(module)) {
            if (isRunnable(module)) {
                if (await isRunning(module)) {
                    const logsOptions = _.compact([
                        options.follow ? '--follow' : null
                    ]).join(' ')
                    await exec({
                        command: './script/docker-compose-logs.sh',
                        args: [module, SEPAL_SRC, ENV_FILE, logsOptions],
                        showStdOut: true
                    })
                }
            } else {
                showModuleStatus(module, STATUS.NON_RUNNABLE)
            }
        }
    } catch (error) {
        showModuleStatus(module, STATUS.ERROR)
        exit({error})
    }
}

export const logs = async (module, options) => {
    await logsModule(module, options)
}

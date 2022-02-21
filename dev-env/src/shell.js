import {exec} from './exec.js'
import {exit, isModule, isRunnable, isRunning, showModuleStatus, STATUS} from './utils.js'
import {SEPAL_SRC, ENV_FILE} from './config.js'
import _ from 'lodash'

const shellModule = async (module, options = {}, _parent) => {
    try {
        if (isModule(module)) {
            if (isRunnable(module)) {
                if (await isRunning(module)) {
                    const shellOptions = _.compact([
                        options.root ? '--user=root' : null
                    ]).join(' ')
                    await exec({
                        command: './script/docker-compose-shell.sh',
                        args: [module, SEPAL_SRC, ENV_FILE, shellOptions],
                        enableStdIn: true,
                        showStdOut: true,
                        showStdErr: true
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

export const shell = async (module, options) => {
    await shellModule(module, options)
}

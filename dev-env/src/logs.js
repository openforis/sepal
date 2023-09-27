import {exec} from './exec.js'
import {exit, isModule, isRunnable, showModuleStatus, MESSAGE, getModules} from './utils.js'
import {SEPAL_SRC, ENV_FILE} from './config.js'
import _ from 'lodash'

const logsModule = async (module, {follow, tail, recent, since, until} = {}) => {
    try {
        if (isModule(module)) {
            if (isRunnable(module)) {
                const logsOptions = _.compact([
                    tail || recent || follow ? '--follow' : null,
                    tail ? '--since 0s' : '',
                    recent ? '--since 5m' : '',
                    since ? `--since ${since}` : '',
                    until ? `--until ${until}` : ''
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

export const logs = async (modules, options) => {
    for (const module of getModules(modules)) {
        await logsModule(module, options)
    }
}

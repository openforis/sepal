import {compose} from './compose.js'
import {isModule, isRunnable, showModuleStatus, MESSAGE, getModules} from './utils.js'
import _ from 'lodash'

const logsModule = async (module, {follow, tail, recent, since, until} = {}) => {
    if (isModule(module)) {
        if (isRunnable(module)) {
            await compose({
                module,
                command: 'logs',
                args: [
                    tail || recent || follow ? '--follow' : null,
                    tail ? '--since=0s' : null,
                    recent ? '--since=5m' : null,
                    since ? `--since=${since}` : null,
                    until ? `until=${until}` : null
                ],
                showStdOut: true
            })
        } else {
            showModuleStatus(module, MESSAGE.NON_RUNNABLE)
        }
    }
}

export const logs = async (modules, options) => {
    for (const module of getModules(modules)) {
        await logsModule(module, options)
    }
}

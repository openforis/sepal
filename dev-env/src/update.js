import {exec} from './exec.js'
import {stopModule} from './stop.js'
import {exit, formatPackageVersion, getModules, isNodeModule, isRunnable, isRunning, showModuleStatus, STATUS} from './utils.js'
import {SEPAL_SRC} from './config.js'
import {log} from './log.js'
import ncu from 'npm-check-updates'
import Path from 'path'
import _ from 'lodash'

const updateModule = async (module, path, {check, target} = {}) => {
    try {
        const modulePath = Path.join(SEPAL_SRC, path)
        if (await isNodeModule(modulePath)) {
            const upgrade = !check
            const majorUpgrade = !['patch', 'minor'].includes(target)
            const interactive = upgrade && majorUpgrade
    
            showModuleStatus(module, STATUS.UPDATING)
            const upgraded = await ncu.run({
                cwd: Path.join(SEPAL_SRC, path),
                color: true,
                upgrade,
                target,
                interactive,
                silent: true
            })
            _.forEach(upgraded, (version, pck) => {
                log.info(formatPackageVersion(pck, version))
            })
            showModuleStatus(module, STATUS.UPDATED)
    
            if (_.size(upgraded) > 0) {
                if (upgrade) {
                    if (isRunnable(module) && isRunning(module)) {
                        await stopModule(module)
                    }
                    showModuleStatus(module, STATUS.INSTALLING)
                    await exec({
                        command: './script/npm-install.sh',
                        args: [modulePath],
                        enableStdIn: true,
                        showStdOut: true,
                        showStdErr: true
                    })
                    showModuleStatus(module, STATUS.INSTALLED)
                }
            }
        } else {
            showModuleStatus(module, STATUS.SKIPPED)
        }
    } catch (error) {
        showModuleStatus(module, STATUS.ERROR)
        exit({error})
    }
}

export const update = async (modules, options) => {
    await updateModule('shared', 'lib/js/shared', options)
    for (const module of getModules(modules)) {
        await updateModule(module, `modules/${module}`, options)
    }
}

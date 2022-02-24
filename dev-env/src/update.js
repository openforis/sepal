import {exec} from './exec.js'
import {stopModule} from './stop.js'
import {exit, formatPackageVersion, getModules, isNodeModule, showModuleStatus, STATUS} from './utils.js'
import {SEPAL_SRC} from './config.js'
import {log} from './log.js'
import ncu from 'npm-check-updates'
import Path from 'path'
import _ from 'lodash'

const updatePackageList = async (module, path, {check, target}) => {
    showModuleStatus(module, STATUS.UPDATING_PACKAGES)
    const upgraded = await ncu.run({
        cwd: Path.join(SEPAL_SRC, path),
        color: true,
        upgrade: !check,
        target,
        interactive: !check,
        silent: true
    })
    _.forEach(upgraded, (version, pck) => {
        log.info(formatPackageVersion(pck, version))
    })
    showModuleStatus(module, STATUS.UPDATED_PACKAGES)
}

const installPackages = async (module, modulePath) => {
    await stopModule(module)
    showModuleStatus(module, STATUS.INSTALLING_PACKAGES)
    await exec({
        command: './script/npm-install.sh',
        args: [modulePath],
        enableStdIn: true,
        showStdOut: true,
        showStdErr: true
    })
    showModuleStatus(module, STATUS.INSTALLED_PACKAGES)
}

const updateModule = async (module, path, {check, target} = {}) => {
    try {
        const modulePath = Path.join(SEPAL_SRC, path)
        if (await isNodeModule(modulePath)) {
            if (target) {
                await updatePackageList(module, path, {check, target})
            }
            if (!check) {
                await installPackages(module, modulePath)
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

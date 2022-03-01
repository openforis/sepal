import {exec} from './exec.js'
import {stopModule} from './stop.js'
import {exit, formatPackageVersion, getModules, isNodeModule, showModuleStatus, MESSAGE} from './utils.js'
import {SEPAL_SRC} from './config.js'
import {log} from './log.js'
import ncu from 'npm-check-updates'
import Path from 'path'
import _ from 'lodash'

const updatePackageList = async (module, path, {check, target}) => {
    const modulePath = Path.join(SEPAL_SRC, path)
    showModuleStatus(module, MESSAGE.UPDATING_PACKAGES)
    if (check) {
        await exec({
            command: './script/npm-check-updates.sh',
            args: [modulePath],
            enableStdIn: true,
            showStdOut: true,
            showStdErr: true
        })
    } else {
        const upgraded = await ncu.run({
            cwd: modulePath,
            target,
            color: true,
            upgrade: true,
            interactive: true,
            silent: false,
            jsonUpgraded: true
        })
        _.forEach(upgraded, (version, pck) => {
            log.info(formatPackageVersion(pck, version))
        })
    }
    showModuleStatus(module, MESSAGE.UPDATED_PACKAGES)
}

const installPackages = async (module, modulePath) => {
    await stopModule(module)
    showModuleStatus(module, MESSAGE.INSTALLING_PACKAGES)
    await exec({
        command: './script/npm-install.sh',
        args: [modulePath],
        enableStdIn: true,
        showStdOut: true,
        showStdErr: true
    })
    showModuleStatus(module, MESSAGE.INSTALLED_PACKAGES)
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
            showModuleStatus(module, MESSAGE.SKIPPED)
        }
    } catch (error) {
        showModuleStatus(module, MESSAGE.ERROR)
        exit({error})
    }
}

export const update = async (modules, options) => {
    await updateModule('shared', 'lib/js/shared', options)
    for (const module of getModules(modules)) {
        await updateModule(module, `modules/${module}`, options)
    }
}

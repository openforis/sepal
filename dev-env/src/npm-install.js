import {exec} from './exec.js'
import {stopModule} from './stop.js'
import {exit, getModules, isNodeModule, showModuleStatus, MESSAGE} from './utils.js'
import {SEPAL_SRC} from './config.js'
import Path from 'path'
import _ from 'lodash'

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

const updateModule = async (module, path) => {
    try {
        const modulePath = Path.join(SEPAL_SRC, path)
        if (await isNodeModule(modulePath)) {
            await installPackages(module, modulePath)
        }
    } catch (error) {
        showModuleStatus(module, MESSAGE.ERROR)
        exit({error})
    }
}

export const npmInstall = async (modules, options) => {
    await updateModule('shared', 'lib/js/shared', options)
    for (const module of getModules(modules)) {
        await updateModule(module, `modules/${module}`, options)
    }
}

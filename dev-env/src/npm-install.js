import {exec} from './exec.js'
import {stopModule} from './stop.js'
import {exit, getModules, isNodeModule, showModuleStatus, MESSAGE} from './utils.js'
import {SEPAL_SRC} from './config.js'
import {getLibDepList} from './deps.js'
import Path from 'path'
import _ from 'lodash'

const installPackages = async (module, modulePath, {verbose, clean}) => {
    await stopModule(module)
    const npmInstallOptions = [
        verbose ? '--verbose' : ''
    ].join(' ')
    if (clean) {
        showModuleStatus(module, MESSAGE.CLEANING_PACKAGES)
        await exec({
            command: './script/npm-clean.sh',
            args: [modulePath],
            enableStdIn: true,
            showStdOut: true,
            showStdErr: true
        })
    }
    showModuleStatus(module, MESSAGE.INSTALLING_PACKAGES)
    await exec({
        command: './script/npm-install.sh',
        args: [modulePath, npmInstallOptions],
        enableStdIn: true,
        showStdOut: true,
        showStdErr: true
    })
    showModuleStatus(module, MESSAGE.INSTALLED_PACKAGES)
}

const updateModule = async (module, path, options) => {
    try {
        const modulePath = Path.join(SEPAL_SRC, path)
        if (await isNodeModule(modulePath)) {
            await installPackages(module, modulePath, options)
        }
    } catch (error) {
        showModuleStatus(module, MESSAGE.ERROR)
        exit({error})
    }
}

export const npmInstall = async (modules, options) => {
    const rootModules = getModules(modules)
    const libs = getLibDepList(rootModules)
    for (const lib of libs) {
        await updateModule(lib, `lib/js/${lib}`, options)
    }
    for (const module of rootModules) {
        await updateModule(module, `modules/${module}`, options)
    }
}

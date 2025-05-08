import {stopModule} from './stop.js'
import {getModules, isNodeModule, showModuleStatus, MESSAGE} from './utils.js'
import {SEPAL_SRC} from './config.js'
import {getLibDeps} from './deps.js'
import {access} from 'fs/promises'
import _ from 'lodash'
import {compose} from './compose.js'

const installLibPackages = async (module, lib, {clean, verbose}) => {
    const libPath = `${SEPAL_SRC}/lib/js/${lib}`
    await access(`${libPath}/package.json`)
    showModuleStatus([module, lib].join('/'), MESSAGE.INSTALLING_SHARED_PACKAGES)
    await compose({
        module,
        command: 'run',
        args: [
            '--rm',
            `--workdir=/usr/local/src/sepal/lib/js/${lib}`,
            module,
            'npm',
            clean ? 'clean-install' : 'install',
            verbose ? '--verbose' : '',
            '--install-links=false'
        ],
        showStdOut: verbose
    })
}

const installModulePackages = async (module, {clean, verbose}) => {
    const modulePath = `${SEPAL_SRC}/modules/${module}`
    await access(`${modulePath}/package.json`)
    showModuleStatus(module, MESSAGE.INSTALLING_MODULE_PACKAGES)
    await compose({
        module,
        command: 'run',
        args: [
            '--rm',
            module,
            'npm',
            clean ? 'clean-install' : 'install',
            verbose ? '--verbose' : '',
            '--install-links=false'
        ],
        showStdOut: verbose
    })
}

const updateModule = async (module, options) => {
    const modulePath = `${SEPAL_SRC}/modules/${module}`
    if (await isNodeModule(modulePath)) {
        const libs = getLibDeps(module)
        await stopModule(module)
        showModuleStatus(module, MESSAGE.INSTALLING_PACKAGES)
        for (const lib of libs) {
            await installLibPackages(module, lib, options)
        }
        await installModulePackages(module, options)
        showModuleStatus(module, MESSAGE.INSTALLED_PACKAGES)
    }
}

export const npmInstall = async (modules, options) => {
    const rootModules = getModules(modules, [':node'])
    for (const module of rootModules) {
        await updateModule(module, options)
    }
}

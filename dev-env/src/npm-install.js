import {stopModule} from './stop.js'
import {getModules, isNodeModule, showModuleStatus, MESSAGE, multi} from './utils.js'
import {SEPAL_SRC, USER_GID, USER_UID} from './config.js'
import {getLibDeps} from './deps.js'
import {access} from 'fs/promises'
import _ from 'lodash'
import {compose} from './compose.js'

const installLibPackages = async (module, lib, {clean, verbose, sequential}) => {
    const libPath = `${SEPAL_SRC}/lib/js/${lib}`
    await access(`${libPath}/package.json`)
    if (sequential) {
        showModuleStatus([module, lib].join('/'), MESSAGE.INSTALLING_SHARED_PACKAGES)
    }
    await compose({
        module,
        command: 'run',
        args: [
            `--user=${USER_UID}:${USER_GID}`,
            '-e', 'HOME=/tmp',
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

const installModulePackages = async (module, {clean, verbose, sequential}) => {
    const modulePath = `${SEPAL_SRC}/modules/${module}`
    await access(`${modulePath}/package.json`)
    if (sequential) {
        showModuleStatus(module, MESSAGE.INSTALLING_MODULE_PACKAGES)
    }
    await compose({
        module,
        command: 'run',
        args: [
            `--user=${USER_UID}:${USER_GID}`,
            '-e', 'HOME=/tmp',
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
        await Promise.all([
            await multi(libs, async lib => await installLibPackages(module, lib, options)),
            await installModulePackages(module, options)
        ])
        showModuleStatus(module, MESSAGE.INSTALLED_PACKAGES)
    }
}

export const npmInstall = async (modules, options) => {
    const rootModules = getModules(modules, [':node'])
    await multi(rootModules, async module => await updateModule(module, _.pick(options, ['verbose', 'quiet', 'sequential'])), options.sequential)
}

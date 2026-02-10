import {compose} from './compose.js'
import {start} from './start.js'
import {exec} from './exec.js'
import {getModules, isModule, showModuleStatus, MESSAGE, firstLine, isNodeModule} from './utils.js'
import {getBuildDeps, getBuildRunDeps, getLibDeps} from './deps.js'
import {log} from './log.js'
import _ from 'lodash'
import {SEPAL_SRC} from './config.js'
import {npmInstall} from './npm-install.js'

const ensurePackageLockExists = async (modulePath, lib) => {
    const path = lib ? `${modulePath}/lib/${lib}` : modulePath
    await exec({
        command: 'mkdir',
        args: [
            '-p',
            `${path}/node_modules`
        ]
    })
    await exec({
        command: 'touch',
        args: [
            `${path}/package-lock.json`
        ]
    })
    await exec({
        command: 'chown',
        args: [
            '-R',
            '1000:1000',
            `${path}`
        ]
    })
}

const updateModule = async module => {
    const modulePath = `${SEPAL_SRC}/modules/${module}`
    if (await isNodeModule(modulePath)) {
        const libs = getLibDeps(module)
        await ensurePackageLockExists(modulePath)
        for (const lib of libs) {
            await ensurePackageLockExists(modulePath, lib)
        }
    }
}

const buildModule = async (module, options = {}, pull) => {
    if (isModule(module)) {
        showModuleStatus(module, MESSAGE.BUILDING)
        const gitCommit = firstLine(
            await exec({
                command: 'git',
                args: [
                    'rev-parse',
                    'HEAD'
                ],
                showStdOut: !options.quiet
            })
        )

        await updateModule(module)

        await compose({
            module,
            command: 'build',
            args: [
                !options.cache ? '--no-cache' : null,
                !options.cache && pull ? '--pull' : null,
            ],
            env: {
                ...process.env,
                BUILD_NUMBER: 'latest',
                GIT_COMMIT: gitCommit
            },
            enableStdIn: !options.verbose,
            showStdOut: !options.quiet,
            showStdErr: true
        })
            
        showModuleStatus(module, MESSAGE.BUILT)
    }
}

const getBuildActions = module => {
    const buildDeps = getBuildDeps(module)
    const hasLocalParent = buildDeps.length

    const buildActions = _(buildDeps)
        .map(module => getBuildActions(module))
        .flatten()
        .value()

    const runActions = _(getBuildRunDeps(module))
        .map(module => ({module, action: 'run'}))
        .value()

    return [
        ...buildActions,
        ...runActions,
        {module, action: 'build', pull: !hasLocalParent}
    ]
}

export const build = async (modules, options) => {
    const buildActions = _(getModules(modules))
        .map(module => getBuildActions(module))
        .flatten()
        .uniqWith(_.isEqual)
        .value()

    for (const {module, action, pull} of buildActions) {
        if (action === 'build') {
            await buildModule(module, options, pull)
            await npmInstall(module, {})
        } else if (action === 'run') {
            await start(module, {stop: true})
        } else {
            log.error('Unsupported action:', action)
        }
    }
}

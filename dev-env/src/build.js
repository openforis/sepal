import {compose} from './compose.js'
import {start} from './start.js'
import {exec} from './exec.js'
import {exit, getModules, isModule, showModuleStatus, MESSAGE} from './utils.js'
import {getBuildDeps, getBuildRunDeps} from './deps.js'
import {log} from './log.js'
import _ from 'lodash'

const buildModule = async (module, options = {}, pull) => {
    try {
        if (isModule(module)) {
            showModuleStatus(module, MESSAGE.BUILDING)
            const {stdout} = await exec({
                command: 'git',
                args: [
                    'rev-parse',
                    'HEAD'
                ],
                showStdOut: options.verbose
            })

            const gitCommit = stdout.split('\n')[0]

            await compose({
                module,
                command: 'build',
                args: [
                    !options.cache ? '--no-cache' : null,
                    !options.cache && pull ? '--pull' : null,
                ],
                env: {
                    BUILD_NUMBER: 'latest',
                    GIT_COMMIT: gitCommit
                },
                showStdOut: options.verbose
            })
            
            showModuleStatus(module, MESSAGE.BUILT)
        }
    } catch (error) {
        showModuleStatus(module, MESSAGE.ERROR)
        exit({error})
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
        } else if (action === 'run') {
            await start(module, {stop: true})
        } else {
            log.error('Unsupported action:', action)
        }
    }
}

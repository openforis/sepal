import {SEPAL_SRC, ENV_FILE} from './config.js'
import {start} from './start.js'
import {exec} from './exec.js'
import {exit, getModules, isModule, showModuleStatus, MESSAGE} from './utils.js'
import {getBuildDeps, getBuildRunDeps} from './deps.js'
import {log} from './log.js'
import _ from 'lodash'

const buildModule = async (module, options = {}, parent) => {
    try {
        if (isModule(module)) {
            // showModuleStatus(module, MESSAGE.BUILDING, {sameLine: true})
            showModuleStatus(module, MESSAGE.BUILDING)
            const buildOptions = _.compact([
                !options.cache && (!parent || options.recursive) ? '--no-cache' : null
            ]).join(' ')
            await exec({
                command: './script/docker-compose-build.sh',
                args: [module, SEPAL_SRC, ENV_FILE, buildOptions],
                showStdOut: !options.quiet
            })
            showModuleStatus(module, MESSAGE.BUILT)
        }
    } catch (error) {
        showModuleStatus(module, MESSAGE.ERROR)
        exit({error})
    }
}

const getBuildActions = module => {
    const buildActions = _(getBuildDeps(module))
        .map(module => getBuildActions(module))
        .flatten()
        .value()

    const runActions = _(getBuildRunDeps(module))
        .map(module => ({module, action: 'run'}))
        .value()

    return [
        ...buildActions,
        ...runActions,
        {module, action: 'build'}
    ]
}

export const build = async (modules, options) => {
    const buildActions = _(getModules(modules))
        .map(module => getBuildActions(module))
        .flatten()
        .uniqWith(_.isEqual)
        .value()

    for (const {module, action} of buildActions) {
        if (action === 'build') {
            await buildModule(module, options)
        } else if (action === 'run') {
            await start(module, {stop: true})
        } else {
            log.error('Unsupported action:', action)
        }
    }
}

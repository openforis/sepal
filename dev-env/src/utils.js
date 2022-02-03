import ansi from 'ansi'
import chalk from 'chalk'
import {deps, groups, NAME_COLUMN, STATUS_COLUMN, DEPS_COLUMN, GROUP_PREFIX} from './config.js'
import {log} from './log.js'
import {exec} from './exec.js'
import {getBuildDeps, getDirectRunDeps, getInverseRunDeps} from './deps.js'
import _ from 'lodash'

const cursor = ansi(process.stdout)

export const STATUS = {
    UNDEFINED: 'UNDEFINED',
    NON_RUNNABLE: 'NON_RUNNABLE',
    BUILDING: 'BUILDING',
    BUILT: 'BUILT',
    STARTING: 'STARTING',
    STOPPING: 'STOPPING',
    STOPPED: 'STOPPED',
    ERROR: 'ERROR'
}

const MESSAGE = {
    UNDEFINED: chalk.grey('UNDEFINED'),
    NON_RUNNABLE: chalk.grey('NON-RUNNABLE'),
    BUILDING: chalk.green('BUILDING...'),
    BUILT: chalk.greenBright('BUILT'),
    STARTING: chalk.green('STARTING...'),
    STOPPING: chalk.red('STOPPING...'),
    STOPPED: chalk.redBright('STOPPED'),
    ERROR: chalk.bgRed('ERROR')
}

const formatModule = (module, {pad = true} = {}) =>
    chalk.cyanBright(pad ? module : module)

const formatDeps = modules => {
    const deps = modules.map(
        module => formatModule(module, {pad: false})
    )
    return deps.length ? `[${deps.join(', ')}]` : ''
}

const getAllModules = () =>
    Object.keys(deps)

const started = info => {
    const statusColors = {
        RUNNING: chalk.greenBright,
        EXITED: chalk.redBright,
        RESTARTING: chalk.yellowBright
    }
    const defaultColor = chalk.grey
    const itemMatcher = /^(.+?)\((.+?)\)$/
    return info
        .toUpperCase()
        .split(', ')
        .map(item => {
            const [_, status, count] = item.match(itemMatcher)
            const statusColor = statusColors[status] || defaultColor
            return `${statusColor(`${status}:${count}`)}`
        })
        .join(', ')
}

const getStatus = async modules => {
    const statusModules = getModules(modules)
    try {
        const result = JSON.parse(await exec({command: './script/docker-compose-ls.sh'}))
        return result
            .map(({Name: name, Status: status}) => ({name, status}))
            .filter(
                ({name}) => statusModules.length === 0 || statusModules.includes(name)
            )
    } catch (error) {
        log.error(`Could not get status`, error)
        return null
    }
}

const getBuildDependencyInfo = module => {
    const deps = getBuildDeps(module)
    return deps.length
        ? `based on ${formatDeps(deps)}`
        : null
}

const getDirectDependencyInfo = module => {
    const deps = getDirectRunDeps(module)
    return deps.length
        ? `uses ${formatDeps(deps)}`
        : null
}

const getInverseDependencyInfo = module => {
    const deps = getInverseRunDeps(module)
    return deps.length
        ? `used by ${formatDeps(deps)}`
        : null
}

const getDepInfo = (module, options = {}) =>
    _.compact([
        (options.dependencies || options.buildDependencies) ? getBuildDependencyInfo(module) : null,
        (options.dependencies || options.directDependencies) ? getDirectDependencyInfo(module) : null,
        (options.dependencies || options.inverseDependencies) ? getInverseDependencyInfo(module) : null
    ]).join(', ')

const expandGroup = group =>
    groups[group] || []

const expandGroups = modules =>
    _(modules)
        .map(moduleOrGroup =>
                moduleOrGroup.startsWith(GROUP_PREFIX)
                    ? expandGroup(moduleOrGroup.substring(GROUP_PREFIX.length)) 
                    : moduleOrGroup
        )
        .flatten()
        .uniq()

export const getModules = modules =>
    _.isEmpty(modules)
        ? getAllModules()
        : expandGroups(_.castArray(modules))

export const showStatus = async (modules, options) => {
    const result = await getStatus(modules)
    for (const module of getModules(modules)) {
        if (isModule(module)) {
            const info = _.find(result, ({name}) => name === module)
            const status = info
                ? started(info.status)
                : isRunnable(module)
                    ? STATUS.STOPPED
                    : STATUS.NON_RUNNABLE
            showModuleStatus(module, status, options)
        }
    }
}
        
export const showModuleStatus = (module, status, options) => {
    cursor
        .hide()
        .eraseLine()
        .horizontalAbsolute(NAME_COLUMN)
        .write(formatModule(module))
        .horizontalAbsolute(STATUS_COLUMN)
        .write(MESSAGE[status] || status)
        .horizontalAbsolute(DEPS_COLUMN)
        .write(getDepInfo(module, options))

    if ([STATUS.STARTING, STATUS.STOPPING].includes(status)) {
        cursor.horizontalAbsolute(0)
    } else {
        cursor.write('\n')
    }
}
        
export const isModule = name => {
    const module = _(deps)
        .find((_, moduleName) => moduleName === name)
    if (!module) {
        showModuleStatus(name, STATUS.UNDEFINED)
    }
    return module
}

export const isRunnable = module =>
    (isModule(module) || {}).run

export const isRunning = async module => {
    const result = await getStatus([module])
    return result.length === 1
}

export const exit = reason => {
    cursor.reset().write('\n').show()
    if (reason.normal) {
        log.info(chalk.greenBright('Completed'))
        process.exit(0)
    }
    else if (reason.error) {
        const error = reason.error
        log.error(chalk.bgRed('Error'), error.stderr || error)
        process.exit(1)
    }
    else if (reason.interrupted) {
        log.info(chalk.yellow('Interrupted (SIGINT)'))
        process.exit(2)
    }
    else {
        log.info(chalk.redBright('Unsupported exit reason:'), reason)
        process.exit(3)
    }
}

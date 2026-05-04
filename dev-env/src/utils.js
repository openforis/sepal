import ansi from 'ansi'
import chalk from 'chalk'
import {deps, groups, NAME_COLUMN, STATUS_COLUMN, DEPS_COLUMN, GROUP_PREFIX, EXCLUDE_PREFIX, SEPAL_SRC} from './config.js'
import {log} from './log.js'
import {allowsProductionMode, getBuildDeps, getDirectRunDepList, getDirectRunDeps, getInverseRunDeps} from './deps.js'
import _ from 'lodash'
import {stat} from 'fs/promises'
import Path from 'path'
import {compose} from './compose.js'
import {hasComposeOverride, listModules} from './docker.js'

const cursor = ansi(process.stdout)

export const STATUS = {
    UNDEFINED: 'UNDEFINED',
    NON_RUNNABLE: 'NON_RUNNABLE',
    BUILDING: 'BUILDING',
    BUILT: 'BUILT',
    STARTING: 'STARTING',
    RUNNING: 'RUNNING',
    STOPPING: 'STOPPING',
    STOPPED: 'STOPPED',
    ERROR: 'ERROR',
    UPDATING_PACKAGES: 'UPDATING_PACKAGES',
    UPDATED_PACKAGES: 'UPDATED_PACKAGES',
    CLEANING_PACKAGES: 'CLEANING_PACKAGES',
    INSTALLING_PACKAGES: 'INSTALLING_PACKAGES',
    INSTALLING_SHARED_PACKAGES: 'INSTALLING_SHARED_PACKAGES',
    INSTALLING_MODULE_PACKAGES: 'INSTALLING_MODULE_PACKAGES',
    INSTALLED_PACKAGES: 'INSTALLED_PACKAGES',
    AUDITING_PACKAGES: 'AUDITING_PACKAGES',
    AUDITED_PACKAGES: 'AUDITED_PACKAGES',
    REBUILDING_PACKAGES: 'REBUILDING_PACKAGES',
    SKIPPED: 'SKIPPED'
}

export const MESSAGE = {
    UNDEFINED: chalk.grey('UNDEFINED'),
    BUILDING: chalk.green('BUILDING...'),
    NON_RUNNABLE: chalk.grey('NON-RUNNABLE'),
    BUILT: chalk.greenBright('BUILT'),
    STARTING: chalk.green('STARTING...'),
    STOPPING: chalk.red('STOPPING...'),
    STOPPED: chalk.redBright('STOPPED'),
    ERROR: chalk.bgRed('ERROR'),
    UPDATING_PACKAGES: chalk.magenta('UPDATING PACKAGES...'),
    UPDATED_PACKAGES: chalk.magentaBright('UPDATED PACKAGES'),
    CLEANING_PACKAGES: chalk.magenta('CLEANING PACKAGES...'),
    INSTALLING_PACKAGES: chalk.magenta('INSTALLING PACKAGES...'),
    INSTALLING_SHARED_PACKAGES: chalk.magenta('INSTALLING SHARED PACKAGES...'),
    INSTALLING_MODULE_PACKAGES: chalk.magenta('INSTALLING MODULE PACKAGES...'),
    INSTALLED_PACKAGES: chalk.magentaBright('INSTALLED PACKAGES'),
    AUDITING_PACKAGES: chalk.magenta('AUDITING PACKAGES...'),
    AUDITED_PACKAGES: chalk.magentaBright('AUDITED PACKAGES'),
    TESTING_PACKAGES: chalk.magenta('TESTING PACKAGES...'),
    TESTED_PACKAGES: chalk.magentaBright('TESTED PACKAGES'),
    VALIDATING_SOURCES: chalk.magenta('VALIDATING SOURCES...'),
    VALIDATED_SOURCES: chalk.magentaBright('VALIDATED SOURCES'),
    SKIPPED: chalk.grey('SKIPPED'),
    RUNNING: chalk.greenBright('RUNNING'),
    WATCHING: chalk.greenBright('WATCHING'),
    EXITED: chalk.redBright('EXITED'),
    RESTARTING: chalk.yellowBright('RESTARTING'),
    HEALTH: {
        HEALTHY: chalk.greenBright('HEALTHY'),
        UNHEALTHY: chalk.redBright('UNHEALTHY'),
        STARTING: chalk.yellowBright('STARTING')
    }
}

const formatModule = (module, {pad = true} = {}) =>
    chalk.cyanBright(pad ? module : module)

const formatService = service =>
    chalk.whiteBright(service)

const formatDeps = modules => {
    const deps = modules.map(
        module => formatModule(module, {pad: false})
    )
    return deps.length ? `[${deps.join(', ')}]` : ''
}

const getAllModules = () =>
    Object.keys(deps)

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
    group === 'all' ? getAllModules() : groups[group] || []

const expandGroups = modules =>
    _(modules)
        .map(moduleOrGroup =>
            moduleOrGroup.startsWith(GROUP_PREFIX)
                ? expandGroup(moduleOrGroup.substring(GROUP_PREFIX.length))
                : moduleOrGroup
        )
        .flatten()
        .uniq()
        .value()

const isExclude = entry =>
    entry.startsWith(EXCLUDE_PREFIX)

const stripExclude = entry =>
    entry.substring(EXCLUDE_PREFIX.length)

export const getModules = (modules, defaultModules = [':default']) => {
    const [excludeEntries, includeEntries] = _.partition(_.castArray(modules || []), isExclude)
    let included
    if (_.isEmpty(includeEntries)) {
        const defaults = expandGroups(defaultModules)
        included = defaults.length ? defaults : getAllModules()
    } else {
        included = expandGroups(includeEntries)
    }
    const excluded = expandGroups(excludeEntries.map(stripExclude))
    return _.difference(included, excluded)
}

export const modulePath = module =>
    `${SEPAL_SRC}/modules/${module}`

export const getServices = async module => {
    try {
        const ps = await compose({
            module,
            command: 'ps',
            args: [
                '--format',
                'json'
            ]
        })

        return ps
            .split('\n')
            .filter(line => line.length)
            .map(line => {
                const {Name: name, State: state, Health: health} = JSON.parse(line)
                return {
                    name,
                    state: state.toUpperCase(),
                    health: health.toUpperCase()
                }
            })
    } catch (error) {
        log.error('Could not get health', error)
        return null
    }
}

export const isProductionMode = async module =>
    allowsProductionMode(module) && !(await hasComposeOverride(module))

export const getMode = async module =>
    allowsProductionMode(module)
        ? await hasComposeOverride(module)
            ? 'dev'
            : 'prod'
        : ''

const getBaseStatus = async modules => {
    const STATUS_MATCHER = /(\w+)\((\d+)\)/
    try {
        const base = JSON.parse(await listModules())
            .map(
                ({Name: module, Status: status}) => ({
                    module,
                    status: status
                        .toUpperCase()
                        .split(', ')
                        .map(foo => foo.replace(STATUS_MATCHER, (_ignore, state, count) => `${MESSAGE[state]} (${count})`))
                        .join(', ')
                })
            )
            .filter(
                ({module}) => modules.includes(module)
            )

        return await Promise.all(
            base.map(async entry => {
                // const productionMode = await isProductionMode(entry.module)
                const mode = await getMode(entry.module)
                return {
                    ...entry,
                    // productionMode,
                    mode
                }
            })
        )
    } catch (error) {
        log.error('Could not get status', error)
        return null
    }
}

const getExtendedStatus = async modules =>
    await Promise.all(
        modules
            .map(async module => {
                const services = await getServices(module)
                const status = _(services)
                    .groupBy('state')
                    .mapValues(
                        services => services.map(
                            ({name, health}) => `${formatService(name)}${health ? `: ${MESSAGE.HEALTH[health]}` : ''}`
                        )
                    )
                    .map(
                        (services, state) => `${MESSAGE[state]} [${services.join(', ')}]`
                    )
                    .sort()
                    .value()
                    .join(', ')
                // const productionMode = await isProductionMode(module)
                const mode = await getMode(module)
                // return {module, services, status, productionMode}
                return {module, services, status, mode}
            })
    )

export const getStatus = async (modules, extended) => {
    const status = extended
        ? await getExtendedStatus(modules)
        : await getBaseStatus(modules)
    return status
        ? status?.filter(({status}) => status.length)
        : []
}

export const showStatus = async (modules, options = {}) => {
    const sanitizedModules = _(getDirectRunDepList(getModules(modules), options.dependencies))
        .sort()
        .sortedUniq()
        .value()
    const allModulesStatus = await getStatus(sanitizedModules, options.extended)
    for (const module of sanitizedModules) {
        if (isModule(module)) {
            const moduleStatus = _.find(allModulesStatus, ({module: currentModule}) => currentModule === module)
            if (moduleStatus) {
                const {status, mode} = moduleStatus
                showModuleStatus(module, status, {...options, sameLine: false}, mode)
            } else if (isRunnable(module)) {
                showModuleStatus(module, MESSAGE.STOPPED, options)
            } else {
                showModuleStatus(module, MESSAGE.NON_RUNNABLE, options)
            }
        }
    }
}

const formatMode = mode => {
    switch (mode) {
        case 'dev':
            return chalk.bgGreen(' dev ')
        case 'prod':
            return chalk.bgRed(' prod ')
        default:
            return ''
    }
}

export const showModuleStatus = (module, status, options = {}, mode) => {
    cursor
        .hide()
        .eraseLine()
        .horizontalAbsolute(NAME_COLUMN)
        .write(formatModule(module))
        .horizontalAbsolute(STATUS_COLUMN)
        .write(status)
        .write(' ')
        .write(formatMode(mode))
        .horizontalAbsolute(DEPS_COLUMN)
        .write(getDepInfo(module, options))
    if (options.sameLine) {
        cursor.horizontalAbsolute(0)
    } else {
        cursor.write('\n')
    }
}
        
export const isModule = name => {
    const module = _.find(deps, (_, moduleName) => moduleName === name)
    if (!module) {
        showModuleStatus(name, MESSAGE.UNDEFINED)
    }
    return module
}

export const isRunnable = module =>
    isModule(module)?.run

export const isGradleModule = module =>
    isModule(module)?.gradle
    
export const isRunning = async (module, serviceName) => {
    const result = await getStatus([module], true)
    const services = _(result).get(['0', 'services'])
    if (services) {
        if (serviceName) {
            return services.find(service => service.name === serviceName)?.state === 'RUNNING'
        } else {
            return services.every(service => service.state === 'RUNNING')
        }
    }
    return false
}

export const isNodeModule = async absolutePath => {
    try {
        const stats = await stat(Path.join(absolutePath, 'package.json'))
        return stats.isFile()
    } catch (error) {
        if (error.code !== 'ENOENT') {
            log.error(error)
        }
        return false
    }
}

export const exit = reason => {
    cursor.reset().write('\n').show()
    if (reason.normal) {
        process.exit(0)
    } else if (reason.error) {
        const error = reason.error
        log.error(chalk.bgRed('Error\n'))
        log.error(error.stderr || error)
        process.exit(1)
    } else if (reason.interrupted) {
        log.info(chalk.yellow('Interrupted (SIGINT)'))
        process.exit(2)
    } else {
        log.info(chalk.redBright('Unsupported exit reason:'), reason)
        process.exit(3)
    }
}

export const firstLine = text =>
    text.split('\n')[0]

const iterateSequential = async (items, iterator) => {
    for await (const item of items) {
        await iterator(item)
    }
}

const iterateParallel = async (items, iterator) => {
    await Promise.all(
        items.map(async item => await iterator(item))
    )
}

export const multi = async (items, iterator, sequential = false) =>
    sequential
        ? await iterateSequential(items, iterator)
        : await iterateParallel(items, iterator)

export const progress = async (promise, callback) => {
    const result = {}
        
    const complete = async () =>
        new Promise((resolve, reject) => {
            const check = (count = 0) => {
                if (result.done) {
                    resolve()
                } else if (result.error) {
                    reject(result.error)
                } else {
                    callback && callback(count)
                    setTimeout(() => check(count + 1), 1000)
                }
            }
            check()
        })
        
    promise
        .then(() => result.done = true)
        .catch(error => result.error = error)
        
    await complete()
}

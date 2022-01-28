#!/usr/bin/node

const {program} = require('commander')
const {spawn} = require('child_process')
const colors = require('colors')
const _ = require('lodash')
const deps = require('./deps.json')

const SEPAL_SRC = '/usr/local/src/sepal'
const ENV_FILE = '/etc/sepal/config/env'

const NAME_SIZE = 30
const STATUS_SIZE = 40

const log = {
    trace: () => null,
    debug: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error
}

const IMAGE = colors.grey('IMAGE'.padEnd(STATUS_SIZE))
const BUILDING = colors.green('BUILDING'.padEnd(STATUS_SIZE))
const BUILT = colors.brightGreen('BUILT'.padEnd(STATUS_SIZE))
const STARTING = colors.green('STARTING'.padEnd(STATUS_SIZE))
const STOPPING = colors.red('STOPPING'.padEnd(STATUS_SIZE))
const STOPPED = colors.brightRed('STOPPED'.padEnd(STATUS_SIZE))

const started = info => {
    const statusColors = {
        RUNNING: colors.brightGreen,
        EXITED: colors.brightRed,
        RESTARTING: colors.brightYellow
    }
    const defaultColor = colors.grey
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
        .padEnd(STATUS_SIZE)
}

const formatModule = (module, {pad = true} = {}) =>
    colors.brightCyan(pad ? module.padEnd(NAME_SIZE) : module)

const formatDeps = modules => {
    const deps = modules.map(
        module => formatModule(module, {pad: false})
    )
    return deps.length ? `[${deps.join(', ')}]` : ''
}

const parse = async () => {
    if (program.args.length > 0) {
        const [command, ...arguments] = program.args
        switch (command) {
            case 'build': return await build(arguments)
            case 'start': return await start(arguments)
            case 'stop': return await stop(arguments)
            case 'restart': return await restart(arguments)
            case 'status': return await showStatus(arguments)
            case 'npmupdate': return await npmUpdate(arguments)
            default: return usage()
        }
    } else {
        usage()
    }
}

const usage = () => {
    console.info(`
    Usage: sepal <command> [<flags>]

    Commands:
    build       [<module>...]    build module(s)
    start       [<module>...]    start module(s)
    stop        [<module>...]    stop module(s)
    restart     [<module>...]    restart module(s)
    status      [<module>...]    show module(s) status
    npmupdate   [<module>...]    update npm packages for module(s)

    Flags:
    -d, --dependencies  Show direct and inverse dependencies
    -r, --recursive     Recursively process dependencies (for "stop" command)
    -v, --verbose       Show docker compose output when suppressed by default
    -q, --quiet         Suppress docker compose output when shown by default
    `)
    process.exit(1)
}

program.exitOverride()

try {
    program
        .option('-d, --dependencies', 'Show dependencies')
        .option('-r, --recursive', 'Recursive')
        .option('-v, --verbose', 'Verbose')
        .option('-q, --quiet', 'Quiet')
        .parse(process.argv)
} catch (error) {
    usage()
}

const options = program.opts()

const getStatus = async modules => {
    const statusModules = getModules(modules)
    try {
        const result = JSON.parse(await runScript({command: './script/docker-compose-ls.sh'}))
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

const showStatus = async modules => {
    const result = await getStatus(modules)
    for (const module of getModules(modules)) {
        const info = _.find(result, ({name}) => name === module)
        const status = info
            ? started(info.status)
            : STOPPED
        showModuleStatus(module, status)
    }
}

const isModule = name => {
    const module = _(deps)
        .find((_, moduleName) => moduleName === name)
    if (!module) {
        log.warn('Skipping undefined module', name)
    }
    return module
}

const isRunnable = module =>
    (isModule(module) || {}).run

const isRunning = async module => {
    const result = await getStatus([module])
    return result.length === 1
}

const getDepInfo = module => {
    const buildDeps = getBuildDeps(module)
    const directDeps = getDirectRunDeps(module)
    const inverseDeps = getInverseRunDeps(module)
    return _.compact([
        buildDeps.length ? `built on ${formatDeps(buildDeps)}` : null,
        directDeps.length ? `uses ${formatDeps(directDeps)}` : null,
        inverseDeps.length ? `used by ${formatDeps(inverseDeps)}` : null
    ]).join(', ')
}

const showModuleStatus = (module, status) =>
    log.info(`${formatModule(module)}${status}${options.dependencies ? getDepInfo(module) : ''}`)

const build = async modules => {
    const buildModules = getModules(modules)
    for (const module of buildModules) {
        await buildModule(module)
    }
}

const start = async modules => {
    const startModules = getModules(modules)
    for (const module of startModules) {
        await startModule(module)
    }
}

const stop = async modules => {
    const stopModules = getModules(modules)
    for (const module of stopModules) {
        await stopModule(module)
    }
}

const restart = async modules => {
    await stop(modules)
    await start(modules)
}

const buildModule = async module => {
    try {
        if (isModule(module)) {
            if (await isRunning(module)) {
                await stopModule(module)
            }
            await buildDeps(module)
            await startBuildDeps(module)
            showModuleStatus(module, BUILDING)
            await runScript({
                command: './script/docker-compose-build.sh',
                args: [module, SEPAL_SRC, ENV_FILE],
                showOut: !options.quiet
            })
            showModuleStatus(module, BUILT)
            return true
        } else {
            return false
        }
    } catch (error) {
        log.error(`Could not build ${module}`, {error})
        return false
    }
}

const startModule = async module => {
    try {
        if (isRunnable(module)) {
            await startDeps(module)
            if (!await isRunning(module)) {
                showModuleStatus(module, STARTING)
                await runScript({
                    command: './script/docker-compose-up.sh',
                    args: [module, SEPAL_SRC, ENV_FILE],
                    showOut: options.verbose
                })
                await showStatus([module])
            }
            return true
        } else {
            return false
        }
    } catch (error) {
        log.error(`Could not start ${module}`, {error})
        return false
    }
}

const stopModule = async module => {
    try {
        if (isRunnable(module)) {
            if (options.recursive) {
                await stopDeps(module)
            }
            if (await isRunning(module)) {
                showModuleStatus(module, STOPPING)
                await runScript({
                    command: './script/docker-compose-down.sh',
                    args: [module, SEPAL_SRC, ENV_FILE],
                    showOut: options.verbose
                })
                await showStatus([module])
            }
            return true
        } else {
            return false
        }
    } catch (error) {
        log.error(`Could not stop ${module}`, {error})
        return false
    }
}

const buildDeps = async module => {
    const deps = getBuildDeps(module)
    if (deps.length) {
        log.debug(`Build dependencies for module ${module}:`, deps)
        for (const dep of deps) {
            await buildModule(dep, module)
        }
    }
}

const startBuildDeps = async module => {
    const deps = getBuildRunDeps(module)
    if (deps.length) {
        log.debug(`Start build dependencies for module ${module}:`, deps)
        for (const dep of deps) {
            await startModule(dep, module)
        }
    }
}

const startDeps = async module => {
    const deps = getDirectRunDeps(module)
    if (deps.length) {
        log.debug(`Start dependencies for module ${module}:`, deps)
        for (const dep of deps) {
            await startModule(dep, module)
        }
    }
}

const stopDeps = async module => {
    const deps = getInverseRunDeps(module)
    if (deps.length) {
        log.debug(`Stop dependencies for module ${module}:`, deps)
        for (const dep of deps) {
            await stopModule(dep, module)
        }
    }
}

const getBuildDeps = module =>
    _((deps[module] || {}).build || [])
        .keys()
        .value()

const getBuildRunDeps = module =>
    _((deps[module] || {}).build || [])
        .pickBy((type, dep) => type === 'run')
        .keys()
        .value()

const getDirectRunDeps = module =>
    (deps[module] || {}).run

const getInverseRunDeps = module =>
    _(deps)
        .pickBy(({run}) => run && run.includes(module))
        .keys()
        .value()

const getModules = modules =>
    modules && modules.length
        ? modules
        : getAllModules()

const getAllModules = () =>
    Object.keys(deps)

const runScript = ({command, args, showOut, showErr}) =>
    new Promise((resolve, reject) => {
        if (args) {
            log.trace(`Running command ${command} with args:`, args)
        } else {
            log.trace(`Running command ${command} with no args:`)
        }
        const cmd = spawn(command, args)

        let stdout = ''
        let stderr = ''

        cmd.stdout.on('data', data => {
            const out = data.toString('utf8')
            showOut && process.stdout.write(out)
            stdout += out
        })

        cmd.stderr.on('data', data => {
            const err = data.toString('utf8')
            showErr && process.stderr.write(err)
            stderr += err
        })

        cmd.on('close', code =>
            code
                ? reject({code, stderr})
                : resolve(stdout)
        )
    })

parse()

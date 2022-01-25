#!/usr/bin/node

const {program} = require('commander')
const {spawn} = require('child_process')
const colors = require('colors')
const _ = require('lodash')
const deps = require('./deps.json')

// const BASE_DIR = process.env.BASE_DIR
const SEPAL_SRC = "/usr/local/src/sepal"
const ENV_FILE = "/usr/local/lib/sepal-dev-env/.env"

const MODULE_SIZE = 20
const STATUS_SIZE = 40

const log = {
    trace: () => null,
    debug: () => null,
    info: console.info,
    warn: console.warn,
    error: console.error
}

const BUILDING = colors.green('BUILDING'.padEnd(STATUS_SIZE))
const BUILT = colors.brightGreen('BUILT'.padEnd(STATUS_SIZE))
const STARTING = colors.green('STARTING'.padEnd(STATUS_SIZE))
const STARTED = colors.brightGreen('STARTED'.padEnd(STATUS_SIZE))
const STOPPING = colors.red('STOPPING'.padEnd(STATUS_SIZE))
const STOPPED = colors.brightRed('STOPPED'.padEnd(STATUS_SIZE))
const started = info => colors.brightGreen(info.toUpperCase().padEnd(STATUS_SIZE))

const formatModule = (module, {pad = true} = {}) =>
    colors.brightCyan(pad ? module.padEnd(MODULE_SIZE) : module)

const formatDeps = modules => {
    const deps = modules.map(
        module => formatModule(module, {pad: false})
    ).join(', ')
    return deps.length ? `[${deps}]` : ''
}

const fatalError = error => {
    log.error(error)
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
    fatalError(error)
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
        showModuleInfo(module, info ? started(info.status) : STOPPED)
    }
}

const isRunning = async module => {
    const result = await getStatus([module])
    return result.length === 1
}

const getDepInfo = module => {
    const directDeps = getDirectDeps(module)
    const inverseDeps = getInverseDeps(module)
    return _.compact([
        directDeps.length ? `uses ${formatDeps(directDeps)}` : null,
        inverseDeps.length ? `used by ${formatDeps(inverseDeps)}` : null
    ]).join(', ')
}

const showModuleInfo = (module, status) =>
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
        if (await isRunning(module)) {
            await stopModule(module)
        }
        showModuleInfo(module, BUILDING)
        await runScript({
            command: './script/docker-compose-build.sh',
            args: [module, SEPAL_SRC, ENV_FILE],
            showOut: !options.quiet
        })
        showModuleInfo(module, BUILT)
        return true
    } catch (error) {
        log.error(`Could not start ${module}`, error)
        return false
    }
}

const startModule = async module => {
    try {
        await startDeps(module)
        if (!await isRunning(module)) {
            showModuleInfo(module, STARTING)
            await runScript({
                command: './script/docker-compose-up.sh',
                args: [module, SEPAL_SRC, ENV_FILE],
                showOut: options.verbose
            })
            await showStatus([module])
        }
        return true
    } catch (error) {
        log.error(`Could not start ${module}`, error)
        return false
    }
}

const startDeps = async module => {
    const deps = getDirectDeps(module)
    if (deps.length) {
        log.debug(`Start dependencies for module ${module}:`, deps)
        for (const dep of deps) {
            await startModule(dep, module)
        }
    }
}

const stopModule = async module => {
    try {
        if (options.recursive) {
            await stopDeps(module)
        }
        if (await isRunning(module)) {
            showModuleInfo(module, STOPPING)
            await runScript({
                command: './script/docker-compose-down.sh',
                args: [module, SEPAL_SRC, ENV_FILE],
                showOut: options.verbose
            })
            await showStatus([module])
        }
        return true
    } catch (error) {
        log.error(`Could not stop ${module}`, error)
        return false
    }
}

const stopDeps = async module => {
    const deps = getInverseDeps(module)
    if (deps.length) {
        log.debug(`Stop dependencies for module ${module}:`, deps)
        for (const dep of deps) {
            await stopModule(dep, module)
        }
    }
}

const getDirectDeps = module =>
    (deps[module] || {}).run

const getInverseDeps = module =>
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
            showOut && log.info(out)
            stdout += out
        })
    
        cmd.stderr.on('data', data => {
            const err = data.toString('utf8')
            showErr && log.error(err)
            stderr += err
        })

        cmd.on('close', code =>
            code
                ? reject({code, stderr})
                : resolve(stdout)
        )
    })

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
}

parse()

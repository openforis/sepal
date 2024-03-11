/* eslint-disable no-console */
import config from './log.json'

const levels = {
    TRACE: 1,
    DEBUG: 2,
    INFO: 3,
    WARN: 4,
    ERROR: 5,
    FATAL: 6
}

const defaultLevelName = config.default || 'error'

const getLevel = (levelName = '') =>
    levels[levelName.toUpperCase()] || levels[defaultLevelName.toUpperCase()]

const isEnabled = (minLevel, level) =>
    level >= minLevel

const log = (func, levelName, loggerName, args = []) =>
    func(`[${new Date().toISOString()}]`, `[${levelName}]`, `${loggerName} -`, ...args)

const getArg = (arg, level) =>
    typeof arg === 'function'
        ? getArg(arg(level))
        : arg

const getArgs = (args, level) =>
    args.map((arg, index) => getArg(arg, level, index === 0))

export const getLogger = name => {
    const levelName = config[name]
    const level = getLevel(levelName)
    return {
        isTrace: () => isEnabled(level, levels.TRACE),
        isDebug: () => isEnabled(level, levels.DEBUG),
        isInfo: () => isEnabled(level, levels.INFO),
        trace: (...args) => isEnabled(level, levels.TRACE) && log(console.log, 'TRACE', name, getArgs(args, level)),
        debug: (...args) => isEnabled(level, levels.DEBUG) && log(console.log, 'DEBUG', name, getArgs(args, level)),
        info: (...args) => isEnabled(level, levels.INFO) && log(console.log, 'INFO', name, getArgs(args, level)),
        warn: (...args) => isEnabled(level, levels.WARN) && log(console.warn, 'WARN', name, getArgs(args, level)),
        error: (...args) => isEnabled(level, levels.ERROR) && log(console.error, 'ERROR', name, getArgs(args, level)),
        fatal: (...args) => isEnabled(level, levels.FATAL) && log(console.error, 'UNKNOWN', name, getArgs(args, level))
    }
}

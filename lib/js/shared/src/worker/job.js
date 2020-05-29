const _ = require('lodash')
const {getWorkerManager} = require('./manager')
const {addServices} = require('../service/registry')

// const logConfig = require('root/log.json')

// const log = require('sepal/log').getLogger('job')

// NOTE: ctx is three-state:
//
// - <undefined> when called from worker
// - <object> when called from main thread as the entry point
// - <null> wren called from main thread as a dependency

const isDependency = ctx => ctx === null
const isWorker = ctx => ctx === undefined

const depArgs = (deps = []) =>
    deps.map((m => m(null)))

const depWorker$ = (deps = []) =>
    deps.map((m => m()))
    
const worker = ({jobName, before, worker$}) =>
    _.flatten([...depWorker$(before), {jobName, worker$}])

const evaluateArgs = (argFuncs, ctx) =>
    _.chain(argFuncs)
        .flattenDeep()
        .map(argFunc => argFunc(ctx))
        .value()

const Job = logConfig => {
    const main = ({jobName, jobPath, maxConcurrency, minIdleCount, maxIdleMilliseconds, before, services, args, ctx}) => {
        const argFuncs = [...depArgs(before), args]
        addServices(services)
        return isDependency(ctx)
            ? argFuncs
            : getWorkerManager({jobName, jobPath, logConfig, maxConcurrency, minIdleCount, maxIdleMilliseconds}).submit$({
                args: evaluateArgs(argFuncs, ctx),
                args$: ctx.args$
            })
    }
    
    const assert = (arg, func, msg, required = false) => {
        const valid = required
            ? !_.isNil(arg) && func(arg)
            : _.isNil(arg) || func(arg)
        if (!valid) {
            throw new Error([
                msg,
                required ? '(required)' : ''
            ].join(' '))
        }
    }
    
    const Job = ({jobName, jobPath, maxConcurrency, minIdleCount, maxIdleMilliseconds, before = [], services = [], worker$, args = () => []}) => {
        assert(jobName, _.isString, 'jobName must be a string', true)
        assert(jobPath, _.isString, 'jobPath must be a string', false)
        assert(worker$, _.isFunction, 'worker$ must be a function', true)
        assert(args, _.isFunction, 'args must be a function', true)
        assert(before, _.isArray, 'before must be an array', false)
        assert(maxConcurrency, _.isNumber, 'maxConcurrency must be a number', false)
        assert(minIdleCount, _.isNumber, 'minIdleCount must be a number', false)
        assert(maxIdleMilliseconds, _.isNumber, 'maxIdleMilliseconds must be a number', false)
        
        return ctx => isWorker(ctx)
            ? worker({jobName, before, worker$})
            : main({jobName, jobPath, maxConcurrency, minIdleCount, maxIdleMilliseconds, before, services, args, ctx})
    }
    
    return Job
}

module.exports = Job

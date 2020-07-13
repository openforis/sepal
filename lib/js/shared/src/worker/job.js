const _ = require('lodash')
const assert = require('../assert')
const {getJobScheduler} = require('./scheduler')
const {addServices} = require('../service/registry')
const {WORKER} = require('./factory')

const DEPENDENCY = Symbol()

// NOTE: ctx is three-state:
//
// - WORKER (Symbol) when called from worker
// - DEPENDENCY (Symbol) wren called from main thread as a dependency
// - <object> when called from main thread as the entry point

const isWorker = ctx => ctx === WORKER
const isDependency = ctx => ctx === DEPENDENCY

const depArgs = (deps = []) =>
    deps.map((m => m(DEPENDENCY)))

const depWorker$ = (deps = []) =>
    deps.map((m => m(WORKER)))
    
const worker = ({jobName, before, worker$}) =>
    _.flatten([...depWorker$(before), {jobName, worker$}])

const evaluateArgs = (argFuncs, ctx) =>
    _.chain(argFuncs)
        .flattenDeep()
        .map(argFunc => argFunc(ctx))
        .value()

const Job = logConfig => {
    const main = ({jobName, jobPath, initArgs, maxConcurrency, minIdleCount, maxIdleMilliseconds, before, services, args, ctx}) => {
        const argFuncs = [...depArgs(before), args]
        addServices(services)
        if (isDependency(ctx)) {
            return argFuncs
        } else {
            const jobScheduler = getJobScheduler({jobName, jobPath, logConfig, maxConcurrency, minIdleCount, maxIdleMilliseconds})
            return jobScheduler.submit$({
                initArgs: initArgs && initArgs(),
                args: evaluateArgs(argFuncs, ctx),
                args$: ctx && ctx.args$,
                cmd$: ctx && ctx.cmd$
            })
        }
    }
    
    return ({jobName, jobPath, initArgs, maxConcurrency, minIdleCount, maxIdleMilliseconds, before = [], services = [], worker$, args = () => []}) => {
        assert(jobName, _.isString, 'jobName must be a string', true)
        assert(jobPath, _.isString, 'jobPath must be a string', false)
        assert(initArgs, _.isFunction, 'init must be a function', false)
        assert(worker$, _.isFunction, 'worker$ must be a function returning an Observable', true)
        assert(args, _.isFunction, 'args must be a function', true)
        assert(before, _.isArray, 'before must be an array', false)
        assert(services, _.isArray, 'services must be an array', false)
        assert(maxConcurrency, _.isNumber, 'maxConcurrency must be a number', false)
        assert(minIdleCount, _.isNumber, 'minIdleCount must be a number', false)
        assert(maxIdleMilliseconds, _.isNumber, 'maxIdleMilliseconds must be a number', false)
        
        return ctx => isWorker(ctx)
            ? worker({jobName, before, worker$})
            : main({jobName, jobPath, initArgs, maxConcurrency, minIdleCount, maxIdleMilliseconds, before, services, args, ctx})
    }
}

module.exports = Job

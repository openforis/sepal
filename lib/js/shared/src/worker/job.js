const _ = require('lodash')
const assert = require('../assert')
const {getScheduler} = require('./scheduler')
const {addServices} = require('../service/registry')
const {WORKER} = require('./factory')

const DEPENDENCY = Symbol()

const registry = []

const isValidJobName = jobName =>
    _.isString(jobName) && !registry.includes(jobName)

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

const evaluateInitArgs = (initArgsFunc, ctx) => {
    const initArgs = initArgsFunc && initArgsFunc(ctx)
    assert(initArgs, _.isObject, 'initArgs function must return an object', false)
    return initArgs
}

const Job = logConfig => {
    const main = ({jobName, jobPath, initArgs, before, services, args, ctx}) => {
        const argFuncs = [...depArgs(before), args]
        addServices(services)
        if (isDependency(ctx)) {
            return argFuncs
        } else {
            const scheduler = getScheduler(logConfig)
            return scheduler.submit$({
                // username: ctx.username,
                username: Math.random(),
                jobName,
                jobPath,
                requestId: ctx.requestId,
                requestTag: ctx.requestTag,
                initArgs: evaluateInitArgs(initArgs, ctx),
                args: evaluateArgs(argFuncs, ctx),
                args$: ctx && ctx.args$,
                cmd$: ctx && ctx.cmd$
            })
        }
    }
    
    return ({jobName, jobPath, initArgs, maxConcurrency, minIdleCount, maxIdleMilliseconds, before, services, worker$, args = () => []}) => {
        assert(jobName, isValidJobName, 'jobName must be a unique string', true)
        assert(jobPath, _.isString, 'jobPath must be a string', false)
        assert(initArgs, _.isFunction, 'initArgs must be a function returning an object', false)
        assert(worker$, _.isFunction, 'worker$ must be a function returning an Observable', true)
        assert(args, _.isFunction, 'args must be a function', true)
        assert(before, _.isArray, 'before must be an array', false)
        assert(services, _.isArray, 'services must be an array', false)

        registry.push(jobName)
        
        return ctx => isWorker(ctx)
            ? worker({jobName, before, worker$})
            : main({jobName, jobPath, initArgs, maxConcurrency, minIdleCount, maxIdleMilliseconds, before, services, args, ctx})
    }
}

module.exports = Job

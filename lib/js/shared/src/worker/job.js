const _ = require('lodash')
const assert = require('../assert')
const {getScheduler} = require('./scheduler')
const {addServices} = require('../service/registry')
const {WORKER} = require('./factory')
const {EMPTY} = require('rxjs')

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

const mainThread = ({jobName, jobPath, schedulerName, initArgs, before, services, args, ctx}) => {
    const argFuncs = [...depArgs(before), args]
    addServices(services)
    if (isDependency(ctx)) {
        return argFuncs
    } else {
        return getScheduler(schedulerName).submit$({
            username: ctx.username,
            jobName,
            jobPath,
            requestId: ctx.requestId,
            requestTag: ctx.requestTag,
            initArgs: evaluateInitArgs(initArgs, ctx),
            args: evaluateArgs(argFuncs, ctx),
            arg$: ctx && ctx.arg$,
            cmd$: ctx && ctx.cmd$
        })
    }
}

const workerThread = ({jobName, before, worker$, finalize$ = () => EMPTY}) =>
    _.flatten([...depWorker$(before), {jobName, worker$, finalize$}])

const Job = ({jobName, jobPath, schedulerName, initArgs, before, services, worker$, finalize$, args = () => []}) => {
    assert(jobName, isValidJobName, 'jobName must be a unique string', true)
    assert(jobPath, _.isString, 'jobPath must be a string', false)
    assert(schedulerName, _.isString, 'schedulerName must be a string', false)
    assert(initArgs, _.isFunction, 'initArgs must be a function returning an object', false)
    assert(worker$, _.isFunction, 'worker$ must be a function returning an Observable', true)
    assert(finalize$, _.isFunction, 'finalize$ must be a function returning an Observable', false)
    assert(args, _.isFunction, 'args must be a function', true)
    assert(before, _.isArray, 'before must be an array', false)
    assert(services, _.isArray, 'services must be an array', false)

    registry.push(jobName)
        
    return ctx => isWorker(ctx)
        ? workerThread({jobName, before, worker$, finalize$})
        : mainThread({jobName, jobPath, schedulerName, initArgs, before, services, args, ctx})
}

module.exports = Job

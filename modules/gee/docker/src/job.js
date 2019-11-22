const _ = require('lodash')

// const {submit$} = require('./worker/single')
const PooledWorker = require('./worker/pooled')
const {submit$} = PooledWorker(3)

// NOTE: ctx is three-state:
//
// - <undefined> when called from worker
// - <object> when called from main thread
// - <null> wren called from main thread as a dependency

const isDependency = ctx => ctx === null
const isWorker = ctx => ctx === undefined

const assert = (arg, func, msg) => {
    if (!func(arg)) {
        throw new Error(msg)
    }
}

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

const submit = ({jobName, jobPath, before, args, ctx}) => {
    const argFuncs = [...depArgs(before), args]
    return isDependency(ctx)
        ? argFuncs
        : submit$(jobName, jobPath, evaluateArgs(argFuncs, ctx))
}

const job = ({jobName, jobPath, before = [], worker$, args = () => []}) => {
    assert(jobName, _.isString, 'jobName is required')
    assert(worker$, _.isFunction, 'worker$ is required')
    assert(args, _.isFunction, 'args is required')
    assert(before, _.isArray, 'before must be an array')
    return ctx => isWorker(ctx)
        ? worker({jobName, before, worker$})
        : submit({jobName, jobPath, before, args, ctx})
}

module.exports = job

const _ = require('lodash')

const PooledWorker = require('./pooled')

// const {submit$} = require('./single')
const {submit$} = PooledWorker({
    concurrency: 100,
    maxIdleMilliseconds: 1000
})

// NOTE: ctx is three-state:
//
// - <undefined> when called from worker
// - <object> when called from main thread
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

const main = ({jobName, jobPath, minIdleCount, before, args, ctx}) => {
    const argFuncs = [...depArgs(before), args]
    return isDependency(ctx)
        ? argFuncs
        : submit$({
            jobName,
            jobPath,
            minIdleCount,
            args: evaluateArgs(argFuncs, ctx),
            args$: ctx.args$
        })
}

const assert = (arg, func, msg) => {
    if (!func(arg)) {
        throw new Error(msg)
    }
}

const defined = v => !_.isNil(v)

const job = ({jobName, jobPath, minIdleCount, before = [], worker$, args = () => []}) => {
    assert(jobName, defined, 'jobName is required')
    assert(jobName, _.isString, 'jobName must be a string')
    assert(worker$, defined, 'worker$ is required')
    assert(worker$, _.isFunction, 'worker$ must be a function')
    assert(args, defined, 'args is required')
    assert(args, _.isFunction, 'args must be a function')
    assert(before, _.isArray, 'before must be an array')
    return ctx => isWorker(ctx)
        ? worker({jobName, before, worker$})
        : main({jobName, jobPath, minIdleCount, before, args, ctx})
}

module.exports = job

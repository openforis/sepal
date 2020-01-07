const {Subject} = require('rxjs')
const {deserializeError} = require('serialize-error')
const _ = require('lodash')
const PooledWorker = require('./pooled')
// const log = require('sepalLog')('job')

// const {submit$} = require('./single')
// const {submit$} = PooledWorker({
//     concurrency: 100,
//     defaultMinIdleCount: 10,
//     defaultMaxIdleMilliseconds: 5000
// })

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

const workerGroups = {}

const getWorkerGroup = ({jobName, jobPath, maxConcurrency, minIdleCount, maxIdleMilliseconds}) => {
    if (!workerGroups[jobName]) {
        workerGroups[jobName] = PooledWorker({
            jobName,
            jobPath,
            maxConcurrency,
            minIdleCount,
            maxIdleMilliseconds
        })
    }
    return workerGroups[jobName]
}

const unwrap$ = wrapped$ => {
    const unwrapped$ = new Subject()
    wrapped$.subscribe({
        next: ({value, error}) => {
            value && unwrapped$.next(value)
            error && unwrapped$.error(deserializeError(error))
        },
        error: error => unwrapped$.error(error),
        complete: () => unwrapped$.complete()
    })
    return unwrapped$
}

const main = ({jobName, jobPath, maxConcurrency, minIdleCount, maxIdleMilliseconds, before, args, ctx}) => {
    const argFuncs = [...depArgs(before), args]
    return isDependency(ctx)
        ? argFuncs
        : unwrap$(
            getWorkerGroup({jobName, jobPath, maxConcurrency, minIdleCount, maxIdleMilliseconds}).submit$({
                jobName,
                jobPath,
                args: evaluateArgs(argFuncs, ctx),
                args$: ctx.args$
            })
        )
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

const job = ({jobName, jobPath, maxConcurrency, minIdleCount, maxIdleMilliseconds, before = [], worker$, args = () => []}) => {
    assert(jobName, _.isString, 'jobName must be a string', true)
    assert(worker$, _.isFunction, 'worker$ must be a function', true)
    assert(args, _.isFunction, 'args must be a function', true)
    assert(before, _.isArray, 'before must be an array', false)
    assert(minIdleCount, _.isNumber, 'minIdleCount must be a number', false)
    assert(maxIdleMilliseconds, _.isNumber, 'maxIdleMilliseconds must be a number', false)
    
    return ctx => isWorker(ctx)
        ? worker({jobName, before, worker$})
        : main({jobName, jobPath, maxConcurrency, minIdleCount, maxIdleMilliseconds, before, args, ctx})
}

module.exports = job

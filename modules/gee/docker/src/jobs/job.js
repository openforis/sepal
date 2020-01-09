const {Subject, ReplaySubject} = require('rxjs')
const {takeUntil, finalize} = require('rxjs/operators')
const {deserializeError} = require('serialize-error')
const _ = require('lodash')
const {getWorker} = require('../worker/workers')
// const log = require('sepalLog')('job')

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

const unwrap$ = wrapped$ => {
    const unwrapped$ = new ReplaySubject()
    const stop$ = new Subject()
    wrapped$.pipe(
        takeUntil(stop$)
    ).subscribe(
        ({value, error}) => {
            value && unwrapped$.next(value)
            error && unwrapped$.error(deserializeError(error))
        },
        error => unwrapped$.error(error)
        // stream is allowed to complete
    )
    return unwrapped$.pipe(
        finalize(() => stop$.next())
    )
}

const main = ({jobName, jobPath, maxConcurrency, minIdleCount, maxIdleMilliseconds, before, args, ctx}) => {
    const argFuncs = [...depArgs(before), args]
    return isDependency(ctx)
        ? argFuncs
        : unwrap$(
            getWorker({jobName, jobPath, maxConcurrency, minIdleCount, maxIdleMilliseconds}).submit$({
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
    assert(jobPath, _.isString, 'jobPath must be a string', false)
    assert(worker$, _.isFunction, 'worker$ must be a function', true)
    assert(args, _.isFunction, 'args must be a function', true)
    assert(before, _.isArray, 'before must be an array', false)
    assert(maxConcurrency, _.isNumber, 'maxConcurrency must be a number', false)
    assert(minIdleCount, _.isNumber, 'minIdleCount must be a number', false)
    assert(maxIdleMilliseconds, _.isNumber, 'maxIdleMilliseconds must be a number', false)
    
    return ctx => isWorker(ctx)
        ? worker({jobName, before, worker$})
        : main({jobName, jobPath, maxConcurrency, minIdleCount, maxIdleMilliseconds, before, args, ctx})
}

module.exports = job

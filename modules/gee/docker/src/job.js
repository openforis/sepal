const _ = require('lodash')

// const {submit$} = require('./worker/single')
const PooledWorker = require('./worker/pooled')
const {submit$} = PooledWorker(2)

const assert = (arg, func, msg) => {
    if (!func(arg)) {
        throw new Error(msg)
    }
}

const beforeArgs = (before = [], ctx) =>
    before.map((m => m(ctx)))

const beforeWorkers$ = (before = []) =>
    before.map((m => m()))
    
const worker = ({jobName, before, worker$}) =>
    [...beforeWorkers$(before), {jobName, worker$}]
    
const job = ({jobName, jobPath, before = [], after = [], worker$, args}) => {
    assert(jobName, _.isString, 'jobName is required')
    assert(worker$, _.isFunction, 'worker$ is required')
    assert(args, _.isFunction, 'args is required')
    assert(before, _.isArray, 'before must be an array')
    assert(after, _.isArray, 'after must be an array')
    return ctx => ctx
        ? submit$(jobName, jobPath, [...beforeArgs(before, ctx), args(ctx)])
        : worker({jobName, before, worker$})
}

const before = ({jobName, worker$, args}) =>
    ctx => ctx
        ? args(ctx)
        : {jobName, worker$}

module.exports = {job, before}

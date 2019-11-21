const _ = require('lodash')

// const {submit$} = require('./worker/single')
const PooledWorker = require('./worker/pooled')
const {submit$} = PooledWorker(2)

const beforeArgs = (before = [], ctx) =>
    before.map((m => m(ctx)))

const beforeWorkers$ = (before = []) =>
    before.map((m => m()))
    
const worker = ({jobName, before, worker$}) =>
    [...beforeWorkers$(before), {jobName, worker$}]
    
const job = ({jobName, jobPath, before, worker$, args}) => {
    return ctx => ctx
        ? submit$(jobName, jobPath, [...beforeArgs(before, ctx), args(ctx)])
        : worker({jobName, before, worker$})
}

const before = ({jobName, worker$, args}) =>
    ctx => ctx
        ? args(ctx)
        : {jobName, worker$}

module.exports = {job, before}

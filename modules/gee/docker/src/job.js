const _ = require('lodash')

// const {submit$} = require('./worker/single')
const {submit$} = require('./worker/pooled')

const beforeArgs = (before = [], ctx) =>
    before.map((m => m(ctx)))

const submit = ({jobName, jobPath, before, ctx}) => ({
    submit$: (...args) =>
        submit$(jobName, jobPath, [...beforeArgs(before, ctx), args])
})

const beforeWorkers$ = (before = []) =>
    before.map((m => m()))
    
const worker = ({jobName, before, worker$}) =>
    [...beforeWorkers$(before), {jobName, worker$}]
    
const job = ({jobName, jobPath, before, worker$}) => {
    return ctx => ctx
        ? submit({jobName, jobPath, before, ctx})
        : worker({jobName, before, worker$})
}

const before = ({jobName, worker$, args}) =>
    ctx => ctx
        ? args(ctx)
        : {jobName, worker$}

module.exports = {job, before}

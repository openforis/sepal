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
    
const worker = ({before, worker$}) => (
    [...beforeWorkers$(before), worker$]
)

module.exports = ({jobName, jobPath, before, worker$}) =>
    ctx => ctx
        ? submit({jobName, jobPath, before, ctx})
        : worker({before, worker$})

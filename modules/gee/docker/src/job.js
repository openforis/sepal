const {switchMap} = require('rxjs/operators')
const _ = require('lodash')
const {getWorker$} = require('./workerPool')
// const log = require('./log')

const beforeArgs = (before = [], ctx) =>
    before.map((m => m(ctx)))

const submit = ({jobName, jobPath, before, ctx}) => ({
    submit$: (...args) =>
        getWorker$(jobName, jobPath).pipe(
            switchMap(worker =>
                worker.submit$([...beforeArgs(before, ctx), args])
            )
        )
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

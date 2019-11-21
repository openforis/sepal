const {before, job} = require('@sepal/job')
const {EMPTY} = require('rxjs')

const worker$ = () => EMPTY

module.exports = job({
    jobName: 'Pre-pre-test',
    worker$,
    args: () => [456]
})

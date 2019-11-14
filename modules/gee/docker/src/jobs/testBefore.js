const {before} = require('@sepal/job')
const {EMPTY} = require('rxjs')

const worker$ = () => EMPTY

module.exports = before({
    jobName: 'Pre-test',
    worker$,
    args: () => [123]
})

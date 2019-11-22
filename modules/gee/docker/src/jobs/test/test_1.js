const job = require('@sepal/job')
const {EMPTY} = require('rxjs')
const {delay} = require('rxjs/operators')

const worker$ = () => EMPTY.pipe(delay(Math.random() * 500))

module.exports = job({
    jobName: 'Test 1',
    worker$,
    args: _ctx => ['1']
})

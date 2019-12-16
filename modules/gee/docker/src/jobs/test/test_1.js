const job = require('@sepal/worker/job')
const {EMPTY, timer} = require('rxjs')
const {delay} = require('rxjs/operators')
const {withToken} = require('@sepal/token')

const worker$ = () => EMPTY.pipe(delay(100))
// const worker$ = () =>
// withToken$('test1', timer(100))

module.exports = job({
    jobName: 'Test 1',
    worker$,
    args: _ctx => ['1']
})

const job = require('@sepal/worker/job')
const {EMPTY} = require('rxjs')
const {delay} = require('rxjs/operators')

const worker$ = () => EMPTY.pipe(delay(100))

module.exports = job({
    jobName: 'Test 2',
    worker$,
    before: [require('./test_2_1')],
    args: _ctx => ['2']
})

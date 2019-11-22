const job = require('@sepal/job')
const {EMPTY} = require('rxjs')
const {delay} = require('rxjs/operators')

const worker$ = () => EMPTY.pipe(delay(Math.random() * 500))

module.exports = job({
    jobName: 'Test 2',
    worker$,
    before: [require('./test_2_1')],
    args: _ctx => ['2']
})

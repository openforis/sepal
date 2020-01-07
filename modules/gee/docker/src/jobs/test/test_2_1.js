const job = require('root/worker/job')
const {EMPTY} = require('rxjs')
const {delay} = require('rxjs/operators')

const worker$ = () => EMPTY.pipe(delay(100))

module.exports = job({
    jobName: 'Test 2.1',
    worker$,
    args: _ctx => ['2.1']
})

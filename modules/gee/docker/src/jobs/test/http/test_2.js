const job = require('root/jobs/job')

const worker$ = () => {
    const {EMPTY} = require('rxjs')
    const {delay} = require('rxjs/operators')
    return EMPTY.pipe(delay(100))
}

module.exports = job({
    jobName: 'Test 2',
    worker$,
    before: [require('./test_2_1')],
    args: _ctx => ['2']
})

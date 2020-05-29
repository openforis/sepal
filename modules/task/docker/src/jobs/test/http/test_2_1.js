const job = require('root/jobs/job')

const worker$ = () => {
    const {EMPTY} = require('rxjs')
    const {delay} = require('rxjs/operators')
    return EMPTY.pipe(delay(100))
}

module.exports = job({
    jobName: 'Test 2.1',
    worker$,
    args: _ctx => ['2.1']
})

const job = require('root/jobs/job')

const worker$ = () => {
    const {EMPTY} = require('rx')
    const {delay} = require('rx/operators')
    return EMPTY.pipe(delay(100))
}

module.exports = job({
    jobName: 'Test 2.1',
    worker$,
    args: _ctx => ['2.1']
})

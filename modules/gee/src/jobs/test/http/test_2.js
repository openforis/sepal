const {job} = require('#gee/jobs/job')

const worker$ = () => {
    const {EMPTY, delay} = require('rxjs')
    return EMPTY.pipe(delay(100))
}

module.exports = job({
    jobName: 'Test 2',
    worker$,
    before: [require('./test_2_1')],
    args: _ctx => ['2']
})

const job = require('root/worker/job')

const worker$ = () => {
    const {EMPTY} = require('rxjs')
    const {delay} = require('rxjs/operators')
    return EMPTY.pipe(delay(100))
}

module.exports = job({
    jobName: 'Test 1',
    worker$,
    args: _ctx => ['1']
})

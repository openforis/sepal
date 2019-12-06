const job = require('@sepal/worker/job')
const {timer} = require('rxjs')
const {withToken$} = require('@sepal/token')

const worker$ = () =>
    timer(100)
    // withToken$('test1', timer(100))

module.exports = job({
    jobName: 'Test 1',
    worker$,
    args: _ctx => ['1']
})

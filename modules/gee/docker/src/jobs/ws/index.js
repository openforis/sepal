const job = require('@sepal/worker/job')

const worker$ = () => {
    const {timer} = require('rxjs')
    const {map, take} = require('rxjs/operators')

    return timer(1000, 1000).pipe(
        map(value => `Hello websocket! Value: ${value}`),
        take(5)
    )
}

module.exports = job({
    jobName: 'Websocket',
    jobPath: __filename,
    worker$
})

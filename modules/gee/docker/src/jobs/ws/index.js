const job = require('@sepal/worker/job')

const worker$ = args$ => {
    const {timer, merge} = require('rxjs')
    const {map, take} = require('rxjs/operators')

    return merge(
        timer(1000, 1000).pipe(
            map(value => `Hello websocket! Value: ${value}`),
            take(5)
        ),
        args$
    )
}

module.exports = job({
    jobName: 'Websocket',
    jobPath: __filename,
    worker$
})

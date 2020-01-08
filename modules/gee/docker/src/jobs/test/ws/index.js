const job = require('root/jobs/job')

const worker$ = (name, args$) => {
    const {timer, merge, of} = require('rxjs')
    const {map, take, switchMap, delay} = require('rxjs/operators')

    return merge(
        timer(0, 3000).pipe(
            map(value => `Hello ${name}! Value: ${value}`),
            take(10)
        ),
        args$.pipe(
            switchMap(value =>
                of(`ok: ${value}`).pipe(
                    delay(250),
                )
            )
        )
    )
}

module.exports = job({
    jobName: 'Websocket demo',
    jobPath: __filename,
    args: ({params: {name}}) => [name],
    worker$
})

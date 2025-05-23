const Job = require('#sepal/worker/job')

const worker$ = ({
    requestArgs: {name},
    initArgs: {hello},
    args$
}) => {
    const {timer, merge, of, map, take, mergeMap, delay, throwError} = require('rxjs')

    return merge(
        timer(0, 3000).pipe(
            map(value => `${hello} ${name}! Value: ${value}`),
            take(10)
        ),
        args$.pipe(
            mergeMap(value => value === 'error'
                ? throwError(() => new Error('error!'))
                : of(`ok: ${JSON.stringify(value)}`).pipe(
                    delay(250),
                )
            )
        )
    )
}

module.exports = Job({
    jobName: 'Websocket demo',
    jobPath: __filename,
    schedulerName: 'GoogleEarthEngine',
    before: [],
    initArgs: () => ({hello: 'Hello from websocket demo'}),
    args: ({params: {name}}) => ({
        requestArgs: {name}
    }),
    worker$
})

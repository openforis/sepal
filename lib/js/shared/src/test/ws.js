const Job = require('#sepal/worker/job')

const worker$ = (name, {args$, initArgs: {hello}}) => {
    const {timer, merge, of, map, take, mergeMap, delay, throwError} = require('rxjs')

    return merge(
        timer(0, 3000).pipe(
            map(value => `${hello} ${name}! Value: ${value}`),
            take(10)
        ),
        args$.pipe(
            mergeMap(value => value === 'error'
                ? throwError(() => new Error('error!'))
                : of(`ok: ${value}`).pipe(
                    delay(250),
                )
            )
        )
    )
}

module.exports = Job({
    jobName: 'Websocket demo',
    jobPath: __filename,
    before: [],
    initArgs: () => ({hello: 'Hello from websocket demo'}),
    args: ({params: {name}}) => [name],
    worker$
})

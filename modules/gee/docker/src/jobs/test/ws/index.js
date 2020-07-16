const {job} = require('root/jobs/job')

const worker$ = (name, {args$, initArgs}) => {
    const {timer, merge, of} = require('rx')
    const {map, take, mergeMap, delay} = require('rx/operators')

    return merge(
        timer(0, 3000).pipe(
            map(value => `${initArgs} ${name}! Value: ${value}`),
            take(10)
        ),
        args$.pipe(
            mergeMap(value =>
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
    before: [],
    initArgs: () => 'Hello from websocket demo',
    args: ({params: {name}}) => [name],
    worker$
})

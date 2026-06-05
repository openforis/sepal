import {fileURLToPath} from 'url'
import {timer, merge, of, map, take, mergeMap, delay, throwError} from 'rxjs'
import Job from '#sepal/worker/job'

const __filename = fileURLToPath(import.meta.url)

const worker$ = ({
    requestArgs: {name},
    initArgs: {hello},
    arg$
}) => {
    return merge(
        timer(0, 3000).pipe(
            map(value => `${hello} ${name}! Value: ${value}`),
            take(10)
        ),
        arg$.pipe(
            mergeMap(value => value === 'error'
                ? throwError(() => new Error('error!'))
                : of(`ok: ${JSON.stringify(value)}`).pipe(
                    delay(250),
                )
            )
        )
    )
}

export default Job({
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

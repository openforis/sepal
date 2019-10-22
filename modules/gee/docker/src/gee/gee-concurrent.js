const {Worker} = require('worker_threads')
const path = require('path')
const {Subject, Observable} = require('rxjs')
const {mergeMap} = require('rxjs/operators')

const config = require('../config')

const rootPath = path.dirname(require.main.filename)

const queue$ = new Subject()

const CONCURRENCY = 2

const job$ = ({sepalUser, serviceAccountCredentials, modulePath, args, callback}) => {
    return new Observable(subscriber => {
        const worker = new Worker(path.join(__dirname, 'worker.js'))
        worker.once('message', message => {
            worker.terminate()
            callback(message)
            subscriber.next(message)
            subscriber.complete()
        })
        worker.postMessage({sepalUser, serviceAccountCredentials, modulePath, args})
    })
}

queue$.pipe(
    mergeMap(job$ => {
        console.log({job$})
        return job$
    }, CONCURRENCY)
).subscribe(
    message => {
        console.log({message})
    }
)

module.exports = (req, relativePath, args, callback) => {
    const sepalUser = JSON.parse(req.headers['sepal-user'])
    const serviceAccountCredentials = config.serviceAccountCredentials
    const modulePath = path.join(rootPath, relativePath)
    queue$.next(
        job$({sepalUser, serviceAccountCredentials, modulePath, args, callback})
    )
}

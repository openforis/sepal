import guid from 'guid'
import {Subject} from 'rxjs'
import {exhaustMap, filter, map, mergeAll, mergeMap} from 'rxjs/operators'

export class JobScheduler {
    request$ = new Subject()

    // constructor(jobQueue, concurrent) {
    //     this.jobQueue = jobQueue
    //     this.job$ = this.request$.pipe(
    //         exhaustMap(data =>
    //             this.jobQueue.nextJob$().pipe(
    //                 mergeAll(concurrent),
    //                 map(result => ({result, data}))
    //             )
    //         )
    //     )
    // }

    schedule$(job$) {
        job$.id = guid()
        this.jobQueue.push(job$)
        this.request$.next()
        return this.job$.pipe(
            // filter(value => job$.id === d),
            map(({result}) => result)
        )
    }

    constructor(jobQueue, concurrent) {
        this.jobQueue = jobQueue
        this.job$ = this.request$.pipe(
            map(() => this.jobQueue.nextJob$()),
            mergeAll(concurrent),
            map(value => {
                console.log('value', value)
                return value
            })
        )
    }
    //
    // schedule$(job$, data) {
    //     this.jobQueue.push(job$, data)
    //     this.request$.next(data)
    //     return this.job$.pipe(
    //         // filter(({result, data: d}) => data === d)
    //     )
    // }
}


export class JobQueue {
    push(job) {
        throw Error('push is expected to be overridden by subclass.')
    }

    nextJob() {
        throw Error('nextJob$ is expected to be overridden by subclass.')
    }
}

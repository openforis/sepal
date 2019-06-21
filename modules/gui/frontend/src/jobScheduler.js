import guid from 'guid'
import {of, Subject} from 'rxjs'
import {exhaustMap, expand, filter, first, map, mergeAll, share, tap} from 'rxjs/operators'

export class JobScheduler {
    request$ = new Subject()

    schedule$(data, job$) {
        const id = guid()
        this.request$.next()
        console.log('next request', id)
        this.jobQueue.push(data, {id, job$})
        return this.job$.pipe(
            filter(({id: completedId}) => completedId === id),
            map(({value}) => value),
            first()
        )
    }

    // constructor(jobQueue, concurrent) {
    //     this.jobQueue = jobQueue
    //     this.job$ = this.request$.pipe(
    //         exhaustMap(
    //             () =>
    //                 of(this.jobQueue.pop()).pipe(
    //                     tap(foo => console.log('before', foo)),
    //                     expand(foo => foo, 1),
    //                     tap(foo => console.log('after', foo)),
    //                     filter(job => job),
    //                     map(({id, job$}) => job$.pipe(
    //                         map(value => ({id, value}))
    //                     )),
    //                     tap(foo => console.log('really after', foo)),
    //                 ),
    //         ),
    //         mergeAll(concurrent),
    //         share()
    //     )
    // }

    constructor(jobQueue, concurrent) {
        this.jobQueue = jobQueue
        this.job$ = this.request$.pipe(
            map(() => this.jobQueue.pop()),
            filter(job => job),
            map(({id, job$}) => job$.pipe(
                map(value => {
                    this.request$.next() // Trigger another check after getting a value
                    return ({id, value})
                })
            )),
            mergeAll(concurrent),
            share()
        )
    }

}


export class JobQueue {
    push(job) {
        throw Error('push is expected to be overridden by subclass.')
    }

    nextJob() {
        throw Error('nextJob$ is expected to be overridden by subclass.')
    }
}

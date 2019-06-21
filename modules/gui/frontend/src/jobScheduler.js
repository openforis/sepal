import guid from 'guid'
import {of, Subject} from 'rxjs'
import {exhaustMap, expand, filter, map, mergeAll, share} from 'rxjs/operators'

export class JobScheduler {
    request$ = new Subject()

    schedule$(data, job$) {
        const id = guid()
        this.jobQueue.push(data, {id, job$})
        this.request$.next()
        return this.job$.pipe(
            filter(({id: completedId}) => completedId === id),
            map(({value}) => value)
        )
    }

    constructor(jobQueue, concurrent) {
        this.jobQueue = jobQueue
        this.job$ = this.request$.pipe(
            exhaustMap(
                () =>
                    of(this.jobQueue.pop()).pipe(
                        filter(job => job),
                        map(({id, job$}) => job$.pipe(
                            map(value => ({id, value}))
                        ))
                    ),
            ),
            mergeAll(concurrent),
            share()
        )
    }
    //
    // constructor(jobQueue, concurrent) {
    //     this.jobQueue = jobQueue
    //     this.job$ = this.request$.pipe(
    //         map(() => this.jobQueue.pop()),
    //         filter(job => job),
    //         map(({id, job$}) => job$.pipe(
    //             map(value => ({id, value}))
    //         )),
    //         mergeAll(concurrent),
    //         share()
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

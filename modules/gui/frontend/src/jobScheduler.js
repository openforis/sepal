import {Subject} from 'rxjs'
import {mergeMap} from 'rxjs/operators'

export class JobScheduler {
    schedule$ = new Subject()

    constructor(jobQueue, concurrent) {
        this.jobQueue = jobQueue
        this.concurrent = concurrent
    }

    schedule(job) {
        this.jobQueue.push(job)
        this.schedule$.next()
    }

    job$() {
        return this.schedule$.pipe(
            mergeMap(() => this.jobQueue.nextJob(), this.concurrent)
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

//
// class TileRequestQueue extends JobQueue {
//     pendingRequests = []
//
//     push(tileRequest) {
//         this.pendingRequests.push(tileRequest)
//     }
//
//     nextJob$() {
//         const [tileRequest] = this.pendingRequests.splice(-1, 1)
//         return tileRequest.tile$
//     }
// }
//
// const toTileRequest = i => ({
//     tile$: of(i).pipe(
//         tap(work => console.log('starting', i)),
//         delay(Math.random() * 1000),
//         map(i => {
//             return i
//         })
//     )
// })
//
// const scheduler = new JobScheduler(new TileRequestQueue(), 3)
// scheduler.job$().subscribe(
//     value => console.log('next', value),
//     error => console.log('error', error),
//     () => console.log('complete'),
// )
//
// let i = 0
// for (; i < 10; i++) {
//     scheduler.schedule(toTileRequest(i))
// }


// console.log('POP', scheduler.nextJob$())
// console.log('POP 2', scheduler.nextJob$())
// console.log('POP 3', scheduler.nextJob$())

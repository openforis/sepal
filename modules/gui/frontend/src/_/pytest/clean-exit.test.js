import {Subject, from, interval, of} from 'rxjs'
import {WorkQueue} from './workqueue'
import {map, merge, mergeAll, mergeMap, take} from 'rxjs/operators'

const executeTask = task => {
    console.info(`Running task ${task.description}`)

    const onNext = value => console.info(`${task.description}, value: ${value}`)
    const onError = error => console.info(`${task.description}, got an error: ${error}`)
    const onCompleted = () => console.info(`${task.description}, complete`)
    const observable = task.observable.pipe(
        take(3)
    )
    observable.subscribe(
        onNext, onError, onCompleted
    )
}

const queue = new WorkQueue({concurrency: 2})

const requests = new Subject()
const results = new Subject()

requests.pipe(
    merge(2)
).subscribe(
    value => results.next(value)
)

const dummyTask = name => {
    const tick = name =>
        interval(1).pipe(
            map(i => `${name} ${i}`)
        )
    
    const observable = of(true).pipe(
        mergeMap(() => from([
            queue.enqueue({
                observable: tick(name + ' foo'),
                group: 'some-group',
                description: name + ' foo'
            }),
            queue.enqueue({
                observable: tick(name + ' bar'),
                group: 'some-group',
                description: name + ' bar'
            }),
            queue.enqueue({
                observable: tick(name + ' baz'),
                group: 'some-group',
                description: name + ' baz'
            })
        ])),
        mergeAll()
    )

    return {
        observable,
        description: name
    }
}

executeTask(dummyTask('a'))
executeTask(dummyTask('b'))

/* eslint-disable no-undef */

it('dummy', () => expect(null).toEqual(null))

/* eslint-disable no-console */
require('sepal/log').configureServer({
    'port': 9101,
    'categories': {
        'kafka': 'debug'
    }
})
const {Subject, interval, switchMap, takeUntil} = require('rxjs')
const {createConsumer$, createProducer$} = require('sepal/rxjs/kafka')

const kafkaBroker = 'kafka:9092'
const topicName = 'test-topic'
const groupName = 'test-group'

// Consume 5 messages, then disconnect
const disconnect$ = new Subject()
let count = 0
const consumeMessage = message => {
    count++
    console.log(count, 'consumer next', message.value.toString())
    if (count >= 5) {
        disconnect$.next()
    }
}

createConsumer$({
    topics: [topicName],
    // debug: 'consumer',
    clientId: 'some-consumer-id',
    groupId: groupName,
    groupInstanceId: groupName,
    metadataBrokerList: kafkaBroker
}).pipe(
    switchMap(({message$}) => message$),
    takeUntil(disconnect$)
).subscribe({
    next: consumeMessage,
    error: error => console.error('consumer error', error),
    complete: () => console.log('consumer complete'),
})

const producer$ = createProducer$({
    // debug: 'broker,topic,msg',
    clientId: 'some-producer-id',
    metadataBrokerList: kafkaBroker,
    pollInterval: 100
})

producer$.pipe(
    switchMap(producer => interval(2000).pipe(
        switchMap(() => producer.produce$({
            topic: topicName,
            partition: null,
            message: `Awesome message ${Math.random()}`,
            key: 'Stormwind',
            timestamp: Date.now()
        }))
    )),
    takeUntil(disconnect$)
).subscribe({
    next: next => console.log('producer next', next.topic),
    error: error => console.error('producer error', error),
    complete: () => console.log('producer complete'),
})

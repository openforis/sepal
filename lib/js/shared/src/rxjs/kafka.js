const {Subject, defer, finalize, filter, map, takeUntil} = require('rxjs')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const Kafka = require('node-rdkafka')
const log = require('sepal/log').getLogger('kafka')

// TODO: Validate require arguments

// Many of the callbacks are opt-in. Need to opt-in at construction time.
// Are the callbacks better as callbacks, or should they be converted into streams?
// Maybe keep them as callbacks?

// rebalance_cb
// offset_commit_cb

/*

Supported callbacks
-------------------
artitioner_cb
dr_cb or dr_msg_cb
event_cb
rebalance_cb (see Rebalancing)
offset_commit_cb (see Commits)
*/

const MESSAGE_ID_HEADER_KEY = '__message_id__'

const createConsumer$ = ({
    topics,
    debug, // Array or comma-separated list of debug contexts to enable: consumer,cgrp,topic,fetch,all
    clientId,
    groupId,
    groupInstanceId,
    metadataBrokerList,
    enablePartitionEof,
    topicMetadataRefreshIntervalMs,
    statisticsIntervalMs,
    ...additionalArgs
}) => {
    const ready$ = new Subject()
    const finalized$ = new Subject()

    const message$ = new Subject()

    // Should we get rid of these streams and use callbacks instead?
    const partitionEof$ = new Subject()
    const warning$ = new Subject()
    const event$ = new Subject()
    const stats$ = new Subject()
    const error$ = new Subject()
    const throttle$ = new Subject()

    const kafkaConsumer = new Kafka.KafkaConsumer({
        ...debug ? {debug: Array.isArray(debug) ? debug.join(',') : debug} : {},
        'client.id': clientId,
        'group.id': groupId,
        'group.instance.id': groupInstanceId,
        'metadata.broker.list': metadataBrokerList,
        ...enablePartitionEof ? {'enable.partition.eof': enablePartitionEof} : {},
        ...topicMetadataRefreshIntervalMs ? {'topic.metadata.refresh.interval.ms': topicMetadataRefreshIntervalMs} : {},
        ...statisticsIntervalMs ? {'statistics.interval.ms': statisticsIntervalMs} : {},
        ...additionalArgs
    })

    const consumeCallback = (error, message) => {
        if (error) {
            message$.error(error)
        } else {
            log.trace(`CONSUMER ${kafkaConsumer.name}: Consuming message`, message)
            // Adding commit() function to message, to allow it to be explicitly committed
            message.commit = () => kafkaConsumer.commitMessage(message)
            message$.next(message)
        }
    }
    kafkaConsumer
        .on('ready', () => {
            log.debug(`CONSUMER ${kafkaConsumer.name}: Ready`)
            ready$.next()
        })
        .on('event.log', message => {
            log.debug(`CONSUMER ${kafkaConsumer.name || `${clientId}#disconnected`}: `, message)
        })
        .on('partition.eof', (topic, partition, offset) =>
            partitionEof$.next({topic, partition, offset})
        )
        .on('warning', warning =>
            warning$.next(warning)
        )
        .on('event', event =>
            event$.next(event)
        )
        .on('event.stats', stats =>
            stats$.next(stats)
        )
        .on('event.error', error =>
            error$.next(error)
        )
        .on('event.throttle', throttle =>
            throttle$.next(throttle)
        )

    return defer(() => {
        // TODO: Verify that this is the way to capture connection error
        kafkaConsumer.connect(error => {
            if (error) {
                message$.error(error)
            }
        })
        return ready$.pipe(
            map(() => {
                kafkaConsumer.subscribe(topics)
                kafkaConsumer.consume(consumeCallback)
                return {
                    commit: topicPartition => topicPartition
                        ? kafkaConsumer.commit()
                        : kafkaConsumer.commit(topicPartition),
                    getMetadata: () => kafkaConsumer.getMetadata(),
                    message$: message$.pipe(takeUntil(finalized$)),
                    ...enablePartitionEof ? {partitionEof$: partitionEof$.pipe(takeUntil(finalized$))} : {},
                    warning$: warning$.pipe(takeUntil(finalized$)),
                    event$: event$.pipe(takeUntil(finalized$)),
                    ...statisticsIntervalMs ? {stats$: stats$.pipe(takeUntil(finalized$))} : {},
                    error$: error$.pipe(takeUntil(finalized$)),
                    throttle$: throttle$.pipe(takeUntil(finalized$)),
                }
            }),
            finalize(() => {
                finalized$.next()
                try {
                    log.debug(`CONSUMER ${kafkaConsumer.name}: Disconnecting`)
                    kafkaConsumer.disconnect()
                } catch(error) {
                    log.error(`CONSUMER ${kafkaConsumer.name}: Failed to disconnect`, error)
                }
            })
        )
    })
}

const createProducer$ = ({
    debug, // Array or comma-separated list of debug contexts to enable: broker, topic, msg, all
    clientId,
    metadataBrokerList,
    pollInterval,
    ...additionalArgs
}) => {
    const producer$ = new Subject()
    const delivery$ = new Subject()

    const kafkaProducer = new Kafka.Producer({
        ...debug ? {debug: Array.isArray(debug) ? debug.join(',') : debug} : {},
        'client.id': clientId,
        'metadata.broker.list': metadataBrokerList,
        'dr_cb': true,
        ...additionalArgs
    })

    kafkaProducer
        .on('ready', () => {
            log.debug(`PRODUCER ${kafkaProducer.name}: Ready`)
            if (pollInterval) {
                kafkaProducer.setPollInterval(pollInterval)
            }
            producer$.next(producer)
        })
        .on('delivery-report', (error, report) => {
            if (error) {
            // TODO: Do we really want to send error? One failed delivery will finalize the stream
                delivery$.error(error)
            } else {
                if (log.isTrace()) {
                    log.trace(`PRODUCER ${kafkaProducer.name}: Delivered`, report)
                }
                delivery$.next(report)
            }
        })
        .on('event.log', message => {
            log.debug(`PRODUCER ${kafkaProducer.name || `${clientId}#disconnected`}: `, message)
        })

    // TODO: It would be nice to make the IDE autocomplete this. That's not currently the case
    /**
     * Produce a message to Kafka.
     *
     * @param {string} topic - The topic name to produce to.
     * @param {number|null} partition - The partition number to produce to.
     * @param {string|Buffer|null} message - The message to produce.
     * @param {string} key - The key associated with the message.
     * @param {number|null} timestamp - Timestamp to send with the message.
     * @param {object} opaque - An object you want passed along with this message, if provided.
     * @param {object} headers - A list of custom key value pairs that provide message metadata.
     */
    // TODO: Default values?
    const produce$ = ({topic, partition, message, key, timestamp, opaque, headers = []}) => {
        const messageId = uuid()
        const isBuffer = Buffer.isBuffer(message)
        if (log.isTrace()) {
            log.trace(`PRODUCER ${kafkaProducer.name}, TOPIC ${topic}: Producing message:`, isBuffer ? message.valueOf.toString() : message)
        }
        
        const buffer = isBuffer ? message : Buffer.from(message)
        try {
            kafkaProducer.produce(topic, partition, buffer, key, timestamp, {[MESSAGE_ID_HEADER_KEY]: messageId, message: opaque}, headers)
            if (!pollInterval) {
                kafkaProducer.poll()
            }
        } catch(error) {
            delivery$.error(error)
        }
        return delivery$.pipe(
            // Pair produced message with corresponding delivery report using opaque
            filter(({opaque = {}}) =>
                _.isObjectLike(opaque) && opaque[MESSAGE_ID_HEADER_KEY] === messageId
            )
        )
    }

    const producer = {
        // TODO: Add support for transactions and flushing. Include setPollInterval() and poll() too?
        produce$
    }

    return defer(() => {
        // TODO: Verify that this is the way to capture connection error
        kafkaProducer.connect(error => {
            if (error) {
                producer$.error(error)
            }
        })
        return producer$.pipe(
            // first() // TODO: This or producer$.complete() on ready?
        )
    }).pipe(
        finalize(() => {
            try {
                log.debug(`PRODUCER ${kafkaProducer.name}: Disconnecting`)
                kafkaProducer.disconnect()
            } catch(error) {
                log.error(`PRODUCER ${kafkaProducer.name}: Failed to disconnect`, error)
            }
        })
    )
}

// Producer
// --------
// Transactions
// flush()
// poll(), setPollInterval()

// admin client
// ------------

module.exports = {createConsumer$, createProducer$}

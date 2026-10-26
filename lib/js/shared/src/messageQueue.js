import amqp from 'amqplib'
import {BehaviorSubject, concatMap, defer, map, merge, skipWhile, switchMap} from 'rxjs'

import {getLogger} from '#sepal/log'
import {autoRetry} from '#sepal/rxjs'

const log = getLogger('messageQueue')

const EXCHANGE = 'sepal.topic'

const CONNECT_RETRY_CONFIG = {
    maxRetries: -1,
    minRetryDelay: 500,
    maxRetryDelay: 4000,
    retryDelayFactor: 2,
    onRetry: (error, retryMessage, retryDelay, retryCount) => {
        log.debug(`AMQP connection retry #${retryCount} in ${retryDelay}ms: ${retryMessage}`, error)
    }
}

const RECONNECT_RETRY_CONFIG = {
    maxRetries: -1,
    minRetryDelay: 1000,
    maxRetryDelay: 1000
}

const messageQueue = amqpUri => {
    if (!amqpUri) {
        throw new Error('Missing amqpUri')
    }

    const connectionStatus$ = new BehaviorSubject(false)

    const subscription = defer(() =>
        // The .then is attached at connect time so a connection established after close()
        // (unsubscription doesn't cancel the in-flight promise) is released, not leaked.
        amqp.connect(amqpUri).then(connection => {
            if (connectionStatus$.isStopped) {
                connection.close().catch(() => null)
            }
            return connection
        })
    ).pipe(
        autoRetry(CONNECT_RETRY_CONFIG),
        switchMap(connection => {
            const connection$ = new BehaviorSubject(connection)
            log.info(`Connected to message broker: ${amqpUri}`)
            // amqplib throws an unlistened 'error'; 'close' always follows it and drives the reconnect.
            connection.on('error', err => log.warn(`Message broker connection error: ${amqpUri}`, err))
            connection.on('close', err => {
                log.warn(`Disconnected from message broker: ${amqpUri}`, err)
                connectionStatus$.next(false)
                connection$.error(err)
            })
            return connection$
        }),
        autoRetry(RECONNECT_RETRY_CONFIG)
    ).subscribe({
        next: connection => connectionStatus$.next(connection),
        error: error => log.fatal('Unexpected error in AMQP connection stream', error),
        complete: () => log.fatal('Unexpected complete in AMQP connection stream')
    })

    const close = async () => {
        const connection = connectionStatus$.value
        connectionStatus$.complete()
        subscription.unsubscribe()
        if (connection) {
            try {
                await connection.close()
            } catch (_error) {
                // already closed
            }
        }
    }

    return {connectionStatus$, close}
}

class TopicPublisher {
    // Messages stay here until the broker confirms them, so a reconnect publishes again what it never received.
    #pending = new Set()
    #channel = null
    #subscription

    constructor({amqpUri, publishers}) {
        log.info(`Initializing topic publisher: ${amqpUri}/${EXCHANGE}`)
        this.#subscription = merge(
            ...publishers.map(({key, publish$}) => publish$.pipe(map(msg => ({key, msg}))))
        ).subscribe(({key, msg}) => this.#enqueue({key, msg, content: Buffer.from(JSON.stringify(msg))}))
    }

    async up(connection) {
        const channel = await connection.createConfirmChannel()
        await channel.assertExchange(EXCHANGE, 'topic')
        log.debug(`Topic publisher up, ${this.#pending.size} message(s) pending`)
        this.#channel = channel
        this.#pending.forEach(message => this.#send(message))
    }

    async down() {
        log.debug('Topic publisher down')
        this.#channel = null
    }

    close() {
        this.#subscription.unsubscribe()
    }

    #enqueue(message) {
        this.#pending.add(message)
        this.#channel
            ? this.#send(message)
            : log.debug(`Message broker down, holding message with key [${message.key}]`)
    }

    #send(message) {
        const {key, msg, content} = message
        log.debug(`Sending message with key [${key}]:`, msg)
        try {
            this.#channel.publish(EXCHANGE, key, content, {persistent: true}, error => {
                if (!error) {
                    this.#pending.delete(message)
                }
            })
        } catch (error) {
            // The channel closed with its connection; the reconnect publishes the message again.
            log.debug(`Message with key [${key}] not sent, holding it for the next connection:`, error)
        }
    }
}

class TopicSubscriber {
    #subscribers
    #defaultHandler

    constructor({amqpUri, subscribers, defaultHandler}) {
        log.info(`Initializing topic subscriber: ${amqpUri}/${EXCHANGE}`)
        this.#subscribers = subscribers
        this.#defaultHandler = defaultHandler
    }

    async up(connection) {
        for (const {queue, topic, handler, queueOptions} of this.#subscribers) {
            await this.#subscribe({connection, queue, topic, handler: handler || this.#defaultHandler, queueOptions})
        }
    }

    async down() {
        for (const {topic} of this.#subscribers) {
            log.debug(`Topic subscriber down [${topic}]`)
        }
    }

    async #subscribe({connection, queue, topic, handler, queueOptions}) {
        log.debug(`Topic subscriber up [${topic}]`)
        const channel = await connection.createChannel()
        // no quene gets a server-named queue
        const {queue: queueName = ''} = await channel.assertQueue(queue, {durable: true, ...queueOptions})
        await channel.assertExchange(EXCHANGE, 'topic')
        await channel.bindQueue(queueName, EXCHANGE, topic)
        channel.consume(queueName, msg => this.#handleMessage({channel, msg, handler}))
    }

    #handleMessage({channel, msg, handler}) {
        const key = msg.fields.routingKey
        const message = msg.content.toString()
        try {
            const content = JSON.parse(message)
            log.isTrace()
                ? log.trace(`Received message with key <${key}>:`, content)
                : log.debug(() => `Received message with key <${key}>`)
            Promise.resolve()
                .then(() => handler(key, content))
                .then(
                    () => {
                        log.trace(() => ['Message acknowledged:', msg])
                        channel.ack(msg)
                    },
                    error => {
                        // Requeue once; a redelivered message already failed before, so drop it
                        // instead of redelivering forever (poison-message loop).
                        const requeue = !msg.fields.redelivered
                        requeue
                            ? log.error(() => ['Message not acknowledged, requeueing:', msg, error])
                            : log.error(() => ['Message not acknowledged again, dropping:', msg, error])
                        channel.nack(msg, false, requeue)
                    }
                )
                // The channel closed with its connection; the broker redelivers what it never settled.
                .catch(error => log.warn('Message not settled, left to redelivery:', error))
        } catch (_error) {
            log.error('Received message doesn\'t match expected JSON format:', message)
            channel.ack(msg)
        }
    }
}

const handleConnection = async ({connection, topicPublisher, topicSubscriber}) => {
    if (connection) {
        try {
            await topicPublisher.up(connection)
            await topicSubscriber.up(connection)
        } catch (error) {
            // Closing drives the reconnect, which takes everything down and sets it up again.
            log.error('Message broker setup failed, reconnecting:', error)
            await connection.close().catch(() => null)
        }
    } else {
        await topicPublisher.down()
        await topicSubscriber.down()
    }
}

const initMessageQueue = async (amqpUri, {publishers = [], subscribers = [], handler: defaultHandler}) => {
    const topicPublisher = new TopicPublisher({amqpUri, publishers})
    const topicSubscriber = new TopicSubscriber({amqpUri, subscribers, defaultHandler})
    const {connectionStatus$, close} = messageQueue(amqpUri)
    connectionStatus$.pipe(
        skipWhile(connection => !connection),
        concatMap(connection =>
            handleConnection({connection, topicPublisher, topicSubscriber})
        )
    ).subscribe({
        error: error => log.fatal('Unexpected error in message queue stream', error),
        complete: () => log.debug('Message queue closed')
    })
    return {
        close: async () => {
            topicPublisher.close()
            await close()
        }
    }
}

export {initMessageQueue}

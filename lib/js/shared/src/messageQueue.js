const amqp = require('amqplib')
const log = require('#sepal/log').getLogger('messageQueue')
const {ReplaySubject, BehaviorSubject, defer, switchMap, concatMap} = require('rxjs')
const {autoRetry} = require('#sepal/rxjs')

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
    minRetryDelay: 1000
}

const messageQueue$ = amqpUri => {
    if (!amqpUri) {
        throw new Error('Missing amqpUri')
    }

    const connectionStatus$ = new ReplaySubject(1)

    defer(() => amqp.connect(amqpUri)).pipe(
        autoRetry(CONNECT_RETRY_CONFIG),
        switchMap(connection => {
            const connection$ = new BehaviorSubject(connection)
            log.info(`Connected to message broker: ${amqpUri}`)
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

    return connectionStatus$
}

const TopicPublisher = ({amqpUri, publishers}) => {
    log.info(`Initializing topic publisher: ${amqpUri}/${EXCHANGE}`)

    const subscriptions = {}

    const publisherUp = async ({connection, key, publish$}) => {
        log.debug(`Topic publisher up [${key}]`)
        const channel = await connection.createChannel()
        await channel.assertExchange(EXCHANGE, 'topic')
        subscriptions[key] = publish$.subscribe(
            msg => {
                log.debug(`Sending message with key [${key}]:`, msg)
                channel.publish(EXCHANGE, key, Buffer.from(JSON.stringify(msg)))
            }
        )
    }

    const up = async connection => {
        for await (const {key, publish$} of publishers) {
            await publisherUp({connection, key, publish$})
        }
    }

    const publisherDown = async ({key}) => {
        log.debug(`Topic publisher down [${key}]`)
        if (subscriptions[key]) {
            subscriptions[key].unsubscribe()
            delete subscriptions[key]
        }
    }

    const down = async () => {
        for await (const {key} of publishers) {
            await publisherDown({key})
        }
    }

    return {up, down}
}

const TopicSubscriber = ({amqpUri, subscribers, defaultHandler}) => {
    log.info(`Initializing topic subscriber: ${amqpUri}/${EXCHANGE}`)

    const handleMessage = ({channel, msg, handler}) => {
        const key = msg.fields.routingKey
        const message = msg.content.toString()
        try {
            const content = JSON.parse(message)
            log.isTrace()
                ? log.trace(`Received message with key <${key}>:`, content)
                : log.debug(() => `Received message with key <${key}>`)
            Promise.resolve(handler(key, content))
                .then(() => {
                    log.trace(() => ['Message acknowledged:', msg])
                    channel.ack(msg)
                })
                .catch(error => {
                    log.error(() => ['Message not acknowledged:', msg, error])
                    channel.nack(msg)
                })
        } catch (error) {
            log.error('Received message doesn\'t match expected JSON format:', message)
            channel.ack(msg)
        }
    }

    const subscriberUp = async ({connection, queue, topic, handler}) => {
        log.debug(`Topic subscriber up [${topic}]`)
        const channel = await connection.createChannel()
        await channel.assertQueue(queue, {durable: true})
        await channel.assertExchange(EXCHANGE, 'topic')
        await channel.bindQueue(queue, EXCHANGE, topic)
        channel.consume(queue, msg => handleMessage({channel, msg, handler}))
    }

    const up = async connection => {
        for await (const {queue, topic, handler: customHandler} of subscribers) {
            await subscriberUp({amqpUri, connection, queue, topic, handler: customHandler || defaultHandler})
        }
    }

    const subscriberDown = async ({topic}) => {
        log.debug(`Topic subscriber down [${topic}]`)
    }

    const down = async () => {
        for await (const {topic} of subscribers) {
            await subscriberDown({topic})
        }
    }

    return {up, down}
}

const handleConnection = async ({connection, topicPublisher, topicSubscriber}) => {
    if (connection) {
        await topicPublisher.up(connection)
        await topicSubscriber.up(connection)
    } else {
        await topicPublisher.down()
        await topicSubscriber.down()
    }
}

const initMessageQueue = async (amqpUri, {publishers = [], subscribers = [], handler: defaultHandler}) => {
    const topicPublisher = TopicPublisher({amqpUri, publishers})
    const topicSubscriber = TopicSubscriber({amqpUri, subscribers, defaultHandler})
    messageQueue$(amqpUri).pipe(
        concatMap(connection =>
            handleConnection({connection, topicPublisher, topicSubscriber})
        )
    ).subscribe({
        error: error => log.fatal('Unexpected error in message queue stream', error),
        complete: () => log.fatal('Unexpected complete in message queue stream')
    })
}

module.exports = {initMessageQueue}

const amqp = require('amqplib')
const log = require('sepal/log').getLogger('messageQueue')
const {defer, pipe, timer, Subject} = require('rx')
const {retryWhen, mergeMap} = require('rx/operators')

const EXCHANGE = 'sepal.topic'
const RETRY_DELAY_MS = 10000

const retry = delay => pipe(
    retryWhen(error$ =>
        error$.pipe(
            mergeMap(
                error => {
                    log.warn(`Reconnecting in ${delay}ms after error: ${error}`)
                    return timer(delay)
                }
            )
        )
    )
)

const messageQueue$ = amqpUri => {
    if (!amqpUri) {
        throw new Error('Missing amqpUri')
    }
    const connection$ = new Subject()
    const connect = () => {
        defer(async () => await amqp.connect(amqpUri)).pipe(
            retry(RETRY_DELAY_MS)
        ).subscribe(
            connection => {
                log.info(`Connected to message broker: ${amqpUri}`)
                connection.on('close', err => {
                    connection$.next(null)
                    log.warn(`Disconnected from message broker: ${amqpUri}`, err)
                    connect()
                })
                connection$.next(connection)
            }
        )
    }
    connect()
    return connection$
}

const topicPublisher = async ({amqpUri, connection, key, publish$}) => {
    log.info(`Initializing publisher: ${amqpUri}/${EXCHANGE}`)
    const channel = await connection.createChannel()
    channel.assertExchange(EXCHANGE, 'topic')
    publish$.subscribe(
        msg => {
            log.debug(`Sending message with key [${key}]:`, msg)
            channel.publish(EXCHANGE, key, Buffer.from(JSON.stringify(msg)))
        }
    )
}

const topicSubscriber = async ({amqpUri, connection, queue, topic, handler}) => {
    log.info(`Initializing subscriber: ${amqpUri}/${EXCHANGE}/${topic}`)
    const channel = await connection.createChannel()
    await channel.assertQueue(queue, {durable: true})
    channel.assertExchange(EXCHANGE, 'topic')
    channel.bindQueue(queue, EXCHANGE, topic)
    channel.consume(queue, msg => {
        const key = msg.fields.routingKey
        const message = msg.content.toString()
        try {
            const content = JSON.parse(message)
            log.isTrace()
                ? log.trace(`Received message with key <${key}>:`, content)
                : log.debug(`Received message with key <${key}>`)
            Promise.resolve(handler(key, content))
                .then(() => {
                    log.trace(() => 'Message acknowledged:', msg)
                    channel.ack(msg)
                })
                .catch(() => {
                    log.trace(() => 'Message not acknowledged:', msg)
                    channel.nack(msg)
                })
        } catch (error) {
            log.error('Received message doesn\'t match expected JSON format:', message)
            channel.ack(msg)
        }
    })
}

const messageQueue = (amqpUri, initialize) => {
    const publishers = []
    const subscribers = []

    const addPublisher = (key, publish$) =>
        publishers.push({key, publish$})

    const addSubscriber = (queue, topic, handler) =>
        subscribers.push({queue, topic, handler})

    messageQueue$(amqpUri).subscribe(
        connection => {
            if (connection) {
                publishers.forEach(async ({key, publish$}) => {
                    await topicPublisher({amqpUri, connection, key, publish$})
                })
                subscribers.forEach(async ({queue, topic, handler}) => {
                    await topicSubscriber({amqpUri, connection, queue, topic, handler})
                })
            } else {
                // connection down
            }
        }
    )

    initialize({addPublisher, addSubscriber})
}

module.exports = {messageQueue}

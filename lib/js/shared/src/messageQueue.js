const amqp = require('amqplib')
const log = require('#sepal/log').getLogger('messageQueue')
const {defer, Subject, firstValueFrom} = require('rxjs')
const {autoRetry} = require('./rxjs')

const EXCHANGE = 'sepal.topic'

const RETRY_CONFIG = {
    minRetryDelay: 10000
}

const messageQueue$ = amqpUri => {
    if (!amqpUri) {
        throw new Error('Missing amqpUri')
    }
    const connection$ = new Subject()
    const connect = () => {
        defer(async () => {
            log.debug((`Connecting to message broker: ${amqpUri}`))
            return await amqp.connect(amqpUri)
        }).pipe(
            autoRetry(RETRY_CONFIG)
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
    await channel.assertExchange(EXCHANGE, 'topic')
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
    await channel.assertExchange(EXCHANGE, 'topic')
    await channel.bindQueue(queue, EXCHANGE, topic)
    channel.consume(queue, msg => {
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
                .catch(() => {
                    log.trace(() => ['Message not acknowledged:', msg])
                    channel.nack(msg)
                })
        } catch (error) {
            log.error('Received message doesn\'t match expected JSON format:', message)
            channel.ack(msg)
        }
    })
}

const initMessageQueue = async (amqpUri, {publishers = [], subscribers = []}) => {
    const connection = await firstValueFrom(messageQueue$(amqpUri))
    for await (const {key, publish$} of publishers) {
        await topicPublisher({amqpUri, connection, key, publish$})
    }
    for await (const {queue, topic, handler} of subscribers) {
        await topicSubscriber({amqpUri, connection, queue, topic, handler})
    }
}

module.exports = {initMessageQueue}

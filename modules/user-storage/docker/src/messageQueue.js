const amqp = require('amqplib')
const {amqpUri} = require('./config')
const log = require('sepal/log').getLogger('messageQueue')
const {defer, pipe, timer, Subject} = require('rxjs')
const {retryWhen, mergeMap} = require('rxjs/operators')

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

const connect$ = () => {
    const connection$ = new Subject()
    const connect = () => {
        defer(async () => await amqp.connect(amqpUri)).pipe(
            retry(RETRY_DELAY_MS)
        ).subscribe(
            connection => {
                log.info(`Connected to message broker: ${amqpUri}`)
                connection.on('close', err => {
                    log.warn(`Disconnected from message broker: ${amqpUri}`, err)
                    connect()
                })
                connection$.next({
                    topicPublisher: async () => await topicPublisher(connection),
                    topicSubscriber: async options => await topicSubscriber(connection, options)
                })
            }
        )
    }
    connect()
    return connection$
}

const topicSubscriber = async (connection, {queue, topic, handler}) => {
    log.info(`Initializing subscriber: ${amqpUri}/${EXCHANGE}/${topic}`)
    const channel = await connection.createChannel()
    await channel.assertQueue(queue, {durable: true})
    channel.assertExchange(EXCHANGE, 'topic')
    channel.bindQueue(queue, EXCHANGE, topic)
    channel.consume(queue, msg => {
        const key = msg.fields.routingKey
        const content = JSON.parse(msg.content.toString())
        log.debug(`Received message with key [${key}]:`, content)
        Promise.resolve(handler(key, content))
            .then(() => {
                channel.ack(msg)
                log.trace(() => 'Message acknowledged:', msg)
            })
            .catch(() => {
                channel.nack(msg)
                log.trace(() => 'Message not acknowledged:', msg)
            })
    })
}

const topicPublisher = async connection => {
    log.info(`Initializing publisher: ${amqpUri}/${EXCHANGE}`)
    const channel = await connection.createChannel()
    channel.assertExchange(EXCHANGE, 'topic')
    return {
        publish: (key, msg) => {
            log.debug(`Sending message with key [${key}]:`, msg)
            channel.publish(EXCHANGE, key, Buffer.from(JSON.stringify(msg)))
        }
    }
}

module.exports = {
    connect$
}

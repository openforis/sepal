const amqp = require('amqplib')
const {amqpUri} = require('./config')
const log = require('sepal/log').getLogger('messageQueue')

const EXCHANGE = 'sepal.topic'

const initMessageQueue = async () => {
    log.debug(`Connecting to broker: ${amqpUri}`)
    const connection = await amqp.connect(amqpUri)
    log.info(`Connected to message broker: ${amqpUri}`)
    return {
        topicSubscriber: async options => await topicSubscriber(connection, options),
        topicPublisher: async options => await topicPublisher(connection, options)
    }
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
            .then(() => channel.ack(msg))
            .catch(() => channel.nack(msg))
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
    initMessageQueue
}

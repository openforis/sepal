const amqp = require('amqplib')
const {amqpUri} = require('./config')
const log = require('sepal/log').getLogger('messageQueue')

const initMessageQueue = async () => {
    log.debug(`Connecting to broker: ${amqpUri}`)
    const connection = await amqp.connect(amqpUri)
    return {
        topicSubscriber: async options => await topicSubscriber(connection, options),
        topicPublisher: async options => await topicPublisher(connection, options)
    }
}

// workerSession.WorkerSessionActivated
// workerSession.WorkerSessionClosed
// files.FilesDeleted

const topicSubscriber = async (connection, {exchange, queue, topic, handler}) => {
    log.info(`Initializing subscriber: ${amqpUri}/${exchange}/${topic}`)
    const channel = await connection.createChannel()
    await channel.assertQueue(queue, {durable: true})
    channel.assertExchange(exchange, 'topic')
    channel.bindQueue(queue, exchange, topic)
    channel.consume(queue, msg => {
        const key = msg.fields.routingKey
        const content = msg.content.toString()
        log.debug(`Received message with key ${key}: ${content}`)
        Promise.resolve(handler(key, content))
            .then(() => channel.ack(msg))
            .catch(() => channel.nack(msg))
    })
}

const topicPublisher = async (connection, {exchange}) => {
    log.info(`Initializing publisher: ${amqpUri}/${exchange}`)
    const channel = await connection.createChannel()
    channel.assertExchange(exchange, 'topic')
    return {
        publish: (key, msg) => channel.publish(exchange, key, Buffer.from(msg))
    }
}

module.exports = {
    initMessageQueue
}

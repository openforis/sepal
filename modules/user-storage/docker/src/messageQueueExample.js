require('sepal/log').configureServer(require('./log.json'))

const log = require('sepal/log').getLogger('')

// const config = require('./config')
// const routes = require('./routes')
// const server = require('sepal/httpServer')

// server.start({
//     port: config.port,
//     routes
// })

const amqp = require('amqplib')

const pub = name =>
    async () => {
        const connection = await amqp.connect('amqp://rabbitmq')
        const channel = await connection.createChannel()

        // channel.assertQueue(name, {durable: false})
        // channel.sendToQueue(name, Buffer.from('Hello there 1!'))
        // channel.sendToQueue(name, Buffer.from('Hello there 2!'))
        // channel.sendToQueue(name, Buffer.from('Hello there 3!'))

        channel.assertExchange(name, 'fanout', {durable: true})
        channel.publish(name, '', Buffer.from('Hello there 1!'))
        channel.publish(name, '', Buffer.from('Hello there 2!'))
        channel.publish(name, '', Buffer.from('Hello there 3!'))
    }

const sub = (name, instance) =>
    async () => {
        const connection = await amqp.connect('amqp://rabbitmq')
        const channel = await connection.createChannel()

        // channel.assertQueue(name, {durable: false})
        // channel.prefetch(1)

        channel.assertExchange(name, 'fanout', {durable: true})
        const queue = await channel.assertQueue(`${name}-${instance}`, {durable: true})
        channel.bindQueue(queue.queue, name, '')
        console.info(queue.queue)

        channel.consume(queue.queue, msg => {
            log.info(`${instance} received: ${msg.content.toString()}`), {noAck: true}
            // setTimeout(() => channel.ack(msg), 200)
        })
    }

sub('foo01', 'A')()
sub('foo01', 'B')()
setTimeout(() => pub('foo01')(), 500)

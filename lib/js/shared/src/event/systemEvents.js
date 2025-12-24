import {v4 as uuid} from 'uuid'
import {Subject}from 'rxjs'
import {initMessageQueue} from '#sepal/messageQueue'

export const systemEvents$ = async (namespace = uuid()) => {
    const {RABBITMQ_HOST, RABBITMQ_PORT} = process.env

    if (!RABBITMQ_HOST) {
        throw new Error('Missing RabbitMQ host')
    }
    if (!RABBITMQ_PORT) {
        throw new Error('Missing RabbitMQ port')
    }

    const amqpUri = `amqp://${RABBITMQ_HOST}:${RABBITMQ_PORT}`

    const event$ = new Subject()

    const handler = async (key, msg) => {
        event$.next(msg)
    }

    await initMessageQueue(amqpUri, {
        subscribers: [
            {queue: `${namespace}.systemEvent`, topic: 'systemEvent', handler}
        ]
    })

    return event$
}

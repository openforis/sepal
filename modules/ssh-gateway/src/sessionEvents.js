import {Subject} from 'rxjs'

import {initMessageQueue} from '#sepal/messageQueue'

const AMQP_URI = process.env.AMQP_URI || `amqp://${process.env.RABBITMQ_HOST || 'rabbitmq'}`
const TOPIC = 'workerSession.*'

const isRelevantEvent = (username, payload) =>
    !!payload
        && typeof payload.username === 'string'
        && payload.username.toLowerCase() === `${username}`.toLowerCase()

const event$ = new Subject()

let messageQueuePromise = null

// Events are an enhancement — any failure here leaves event$ silent and the menu behaves as it
// always did. main.js disables logging for this process: log output would corrupt the terminal UI.
const initSessionEvents = username => {
    messageQueuePromise = initMessageQueue(AMQP_URI, {
        subscribers: [{
            topic: TOPIC,
            queueOptions: {durable: false, exclusive: true},
            handler: (_key, payload) => {
                if (isRelevantEvent(username, payload)) {
                    event$.next(payload)
                }
            }
        }]
    }).catch(() => null)
    return event$
}

const closeSessionEvents = async () => {
    const messageQueue = messageQueuePromise && await messageQueuePromise
    if (messageQueue) {
        try {
            await messageQueue.close()
        } catch (_error) {
            // ignore — the process is exiting
        }
    }
}

export {closeSessionEvents, initSessionEvents, isRelevantEvent}

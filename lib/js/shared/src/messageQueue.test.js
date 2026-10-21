import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {callsOf} from '#sepal/testSupport/mock'

const channel = {
    assertQueue: mock.fn(async queue => ({queue: queue || 'amq.gen-test'})),
    assertExchange: mock.fn(async () => ({})),
    bindQueue: mock.fn(async () => ({})),
    consume: mock.fn(async () => ({})),
    publish: mock.fn(),
    ack: mock.fn(),
    nack: mock.fn(),
    on: mock.fn()
}

const connection = {
    createChannel: mock.fn(async () => channel),
    on: mock.fn(),
    close: mock.fn(async () => emit('close', new Error('closed')))
}

// Mirrors EventEmitter: an 'error' nobody listens to is thrown, which crashes the process.
const emit = (event, ...args) => {
    const listeners = callsOf(connection.on).filter(([name]) => name === event)
    if (event === 'error' && !listeners.length) throw args[0]
    listeners.forEach(([, listener]) => listener(...args))
}

const connect = mock.fn(async () => connection)

mock.module('amqplib', {
    exports: {
        default: {connect}
    }
})

const {initMessageQueue} = await import('./messageQueue.js')

const flush = () => new Promise(resolve => setTimeout(resolve, 10))

beforeEach(() => {
    for (const fn of [...Object.values(channel), ...Object.values(connection), connect]) fn.mock.resetCalls()
})

describe('initMessageQueue', () => {
    it('asserts subscriber queues as durable by default', async () => {
        await initMessageQueue('amqp://test', {
            subscribers: [{queue: 'module.someQueue', topic: 'some.topic', handler: () => null}]
        })
        await flush()
        assert.deepEqual(callsOf(channel.assertQueue), [['module.someQueue', {durable: true}]])
        assert.deepEqual(
            callsOf(channel.bindQueue),
            [['module.someQueue', 'sepal.topic', 'some.topic']]
        )
    })

    it('applies per-subscriber queue options', async () => {
        await initMessageQueue('amqp://test', {
            subscribers: [{
                queue: '',
                topic: 'workerSession.*',
                queueOptions: {durable: false, exclusive: true},
                handler: () => null
            }]
        })
        await flush()
        assert.deepEqual(callsOf(channel.assertQueue), [['', {durable: false, exclusive: true}]])
    })

    it('binds and consumes a server-named queue by its assigned name', async () => {
        await initMessageQueue('amqp://test', {
            subscribers: [{
                queue: '',
                topic: 'workerSession.*',
                queueOptions: {durable: false, exclusive: true},
                handler: () => null
            }]
        })
        await flush()
        assert.deepEqual(
            callsOf(channel.bindQueue),
            [['amq.gen-test', 'sepal.topic', 'workerSession.*']]
        )
        assert.equal(channel.consume.mock.calls[0].arguments[0], 'amq.gen-test')
    })

    it('requeues a failed message on first delivery', async () => {
        await initMessageQueue('amqp://test', {
            subscribers: [{queue: 'module.someQueue', topic: 'some.topic', handler: () => Promise.reject(new Error('handler failed'))}]
        })
        await flush()
        const consumer = channel.consume.mock.calls[0].arguments[1]
        const msg = {
            fields: {routingKey: 'some.topic', redelivered: false},
            content: Buffer.from(JSON.stringify({some: 'message'}))
        }
        consumer(msg)
        await flush()
        assert.deepEqual(callsOf(channel.nack), [[msg, false, true]])
    })

    it('requeues a message whose handler throws synchronously', async () => {
        await initMessageQueue('amqp://test', {
            subscribers: [{queue: 'module.someQueue', topic: 'some.topic', handler: () => {
                throw new Error('handler failed')
            }}]
        })
        await flush()
        const consumer = channel.consume.mock.calls[0].arguments[1]
        const msg = {
            fields: {routingKey: 'some.topic', redelivered: false},
            content: Buffer.from(JSON.stringify({some: 'message'}))
        }
        consumer(msg)
        await flush()
        assert.deepEqual(callsOf(channel.nack), [[msg, false, true]])
        assert.equal(channel.ack.mock.callCount(), 0)
    })

    it('acks a message that is not valid JSON, without invoking the handler', async () => {
        const handler = mock.fn()
        await initMessageQueue('amqp://test', {
            subscribers: [{queue: 'module.someQueue', topic: 'some.topic', handler}]
        })
        await flush()
        const consumer = channel.consume.mock.calls[0].arguments[1]
        const msg = {
            fields: {routingKey: 'some.topic', redelivered: false},
            content: Buffer.from('not json')
        }
        consumer(msg)
        await flush()
        assert.deepEqual(callsOf(channel.ack), [[msg]])
        assert.equal(channel.nack.mock.callCount(), 0)
        assert.equal(handler.mock.callCount(), 0)
    })

    it('drops a failed message that was already redelivered', async () => {
        await initMessageQueue('amqp://test', {
            subscribers: [{queue: 'module.someQueue', topic: 'some.topic', handler: () => Promise.reject(new Error('handler failed'))}]
        })
        await flush()
        const consumer = channel.consume.mock.calls[0].arguments[1]
        const msg = {
            fields: {routingKey: 'some.topic', redelivered: true},
            content: Buffer.from(JSON.stringify({some: 'message'}))
        }
        consumer(msg)
        await flush()
        assert.deepEqual(callsOf(channel.nack), [[msg, false, false]])
    })

    it('survives a connection error', async () => {
        await initMessageQueue('amqp://test', {
            subscribers: [{queue: 'module.someQueue', topic: 'some.topic', handler: () => null}]
        })
        await flush()
        assert.doesNotThrow(() => emit('error', new Error('read ECONNRESET')))
    })

    it('leaves a message to redelivery when its channel closed before the handler finished', async () => {
        const channelClosed = () => {
            throw new Error('Channel closed')
        }
        channel.ack.mock.mockImplementationOnce(channelClosed)
        channel.nack.mock.mockImplementationOnce(channelClosed)
        const unhandled = []
        const onUnhandled = reason => unhandled.push(reason)
        process.on('unhandledRejection', onUnhandled)
        await initMessageQueue('amqp://test', {
            subscribers: [{queue: 'module.someQueue', topic: 'some.topic', handler: () => null}]
        })
        await flush()
        const consumer = channel.consume.mock.calls[0].arguments[1]
        const msg = {
            fields: {routingKey: 'some.topic', redelivered: false},
            content: Buffer.from(JSON.stringify({some: 'message'}))
        }

        consumer(msg)
        await flush()
        process.off('unhandledRejection', onUnhandled)

        assert.deepEqual(unhandled, [])
        assert.equal(channel.nack.mock.callCount(), 0)
    })

    it('close() closes the connection and stops reconnecting', async () => {
        const messageQueue = await initMessageQueue('amqp://test', {
            subscribers: [{queue: 'module.someQueue', topic: 'some.topic', handler: () => null}]
        })
        await flush()
        await messageQueue.close()
        await flush()
        assert.ok(connection.close.mock.callCount() > 0)
        assert.equal(connect.mock.callCount(), 1)
    })

    it('close() before the connection is established closes it once it arrives', async () => {
        let resolveConnect
        connect.mock.mockImplementationOnce(() => new Promise(resolve => {
            resolveConnect = resolve
        }))
        const messageQueue = await initMessageQueue('amqp://test', {
            subscribers: [{queue: 'module.someQueue', topic: 'some.topic', handler: () => null}]
        })
        await messageQueue.close()
        resolveConnect(connection)
        await flush()
        assert.ok(connection.close.mock.callCount() > 0)
        assert.equal(connect.mock.callCount(), 1)
    })
})

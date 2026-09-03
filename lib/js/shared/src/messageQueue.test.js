import {jest} from '@jest/globals'

const channel = {
    assertQueue: jest.fn(async queue => ({queue: queue || 'amq.gen-test'})),
    assertExchange: jest.fn(async () => ({})),
    bindQueue: jest.fn(async () => ({})),
    consume: jest.fn(async () => ({})),
    publish: jest.fn(),
    ack: jest.fn(),
    nack: jest.fn(),
    on: jest.fn()
}

const connection = {
    createChannel: jest.fn(async () => channel),
    on: jest.fn(),
    close: jest.fn(async () => {
        connection.on.mock.calls
            .filter(([event]) => event === 'close')
            .forEach(([, listener]) => listener(new Error('closed')))
    })
}

const connect = jest.fn(async () => connection)

jest.unstable_mockModule('amqplib', () => ({default: {connect}}))

const {initMessageQueue} = await import('./messageQueue.js')

const flush = () => new Promise(resolve => setTimeout(resolve, 10))

beforeEach(() => {
    jest.clearAllMocks()
})

describe('initMessageQueue', () => {
    it('asserts subscriber queues as durable by default', async () => {
        await initMessageQueue('amqp://test', {
            subscribers: [{queue: 'module.someQueue', topic: 'some.topic', handler: () => null}]
        })
        await flush()
        expect(channel.assertQueue).toHaveBeenCalledWith('module.someQueue', {durable: true})
        expect(channel.bindQueue).toHaveBeenCalledWith('module.someQueue', 'sepal.topic', 'some.topic')
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
        expect(channel.assertQueue).toHaveBeenCalledWith('', {durable: false, exclusive: true})
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
        expect(channel.bindQueue).toHaveBeenCalledWith('amq.gen-test', 'sepal.topic', 'workerSession.*')
        expect(channel.consume.mock.calls[0][0]).toBe('amq.gen-test')
    })

    it('requeues a failed message on first delivery', async () => {
        await initMessageQueue('amqp://test', {
            subscribers: [{queue: 'module.someQueue', topic: 'some.topic', handler: () => Promise.reject(new Error('handler failed'))}]
        })
        await flush()
        const consumer = channel.consume.mock.calls[0][1]
        const msg = {
            fields: {routingKey: 'some.topic', redelivered: false},
            content: Buffer.from(JSON.stringify({some: 'message'}))
        }
        consumer(msg)
        await flush()
        expect(channel.nack).toHaveBeenCalledWith(msg, false, true)
    })

    it('requeues a message whose handler throws synchronously', async () => {
        await initMessageQueue('amqp://test', {
            subscribers: [{queue: 'module.someQueue', topic: 'some.topic', handler: () => {
                throw new Error('handler failed')
            }}]
        })
        await flush()
        const consumer = channel.consume.mock.calls[0][1]
        const msg = {
            fields: {routingKey: 'some.topic', redelivered: false},
            content: Buffer.from(JSON.stringify({some: 'message'}))
        }
        consumer(msg)
        await flush()
        expect(channel.nack).toHaveBeenCalledWith(msg, false, true)
        expect(channel.ack).not.toHaveBeenCalled()
    })

    it('acks a message that is not valid JSON, without invoking the handler', async () => {
        const handler = jest.fn()
        await initMessageQueue('amqp://test', {
            subscribers: [{queue: 'module.someQueue', topic: 'some.topic', handler}]
        })
        await flush()
        const consumer = channel.consume.mock.calls[0][1]
        const msg = {
            fields: {routingKey: 'some.topic', redelivered: false},
            content: Buffer.from('not json')
        }
        consumer(msg)
        await flush()
        expect(channel.ack).toHaveBeenCalledWith(msg)
        expect(channel.nack).not.toHaveBeenCalled()
        expect(handler).not.toHaveBeenCalled()
    })

    it('drops a failed message that was already redelivered', async () => {
        await initMessageQueue('amqp://test', {
            subscribers: [{queue: 'module.someQueue', topic: 'some.topic', handler: () => Promise.reject(new Error('handler failed'))}]
        })
        await flush()
        const consumer = channel.consume.mock.calls[0][1]
        const msg = {
            fields: {routingKey: 'some.topic', redelivered: true},
            content: Buffer.from(JSON.stringify({some: 'message'}))
        }
        consumer(msg)
        await flush()
        expect(channel.nack).toHaveBeenCalledWith(msg, false, false)
    })

    it('close() closes the connection and stops reconnecting', async () => {
        const messageQueue = await initMessageQueue('amqp://test', {
            subscribers: [{queue: 'module.someQueue', topic: 'some.topic', handler: () => null}]
        })
        await flush()
        await messageQueue.close()
        await flush()
        expect(connection.close).toHaveBeenCalled()
        expect(connect).toHaveBeenCalledTimes(1)
    })

    it('close() before the connection is established closes it once it arrives', async () => {
        let resolveConnect
        connect.mockImplementationOnce(() => new Promise(resolve => {
            resolveConnect = resolve
        }))
        const messageQueue = await initMessageQueue('amqp://test', {
            subscribers: [{queue: 'module.someQueue', topic: 'some.topic', handler: () => null}]
        })
        await messageQueue.close()
        resolveConnect(connection)
        await flush()
        expect(connection.close).toHaveBeenCalled()
        expect(connect).toHaveBeenCalledTimes(1)
    })
})

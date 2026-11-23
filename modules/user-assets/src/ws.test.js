import assert from 'node:assert/strict'
import {afterEach, before, beforeEach, describe, mock, test} from 'node:test'

import {Subject} from 'rxjs'

import {configureNoLogging} from '#sepal/log'
import {callsOf} from '#sepal/testSupport/mock'

let assetManager
mock.module('./assetManager.js', {exports: {
    createAssetManager: ({send}) => {
        assetManager = {
            remove: mock.fn(({paths}) => paths.forEach(path => path.join('/'))),
            createFolder: mock.fn(({path}) => path.join('/')),
            reload: mock.fn(),
            subscriptionUp: mock.fn(({username, clientId, subscriptionId}) =>
                send({clientId, subscriptionId, data: {username}})
            )
        }
        return assetManager
    }
}})

const {default: ws} = await import('./ws.js')

let incoming$
let received
let subscription

before(() => configureNoLogging())

beforeEach(async () => {
    incoming$ = new Subject()
    received = []
    subscription = ws({arg$: incoming$}).subscribe(message => received.push(message))
    await new Promise(resolve => setImmediate(resolve))
})

afterEach(() => subscription.unsubscribe())

describe('asset commands on a shared gateway connection', () => {
    for (const data of [
        {remove: 'bad'},
        {remove: [null]},
        {remove: [['projects', 'alice', 'assets', 'valid'], null]},
        {remove: [[]]},
        {remove: [['projects', 42]]},
        {remove: [['projects', '']]},
        {createFolder: 'bad'},
        {createFolder: {}},
        {createFolder: []},
        {createFolder: [null]}
    ]) {
        test(`rejects invalid paths without affecting another user: ${JSON.stringify(data)}`, () => {
            incoming$.next(command(data))

            incoming$.next({hb: 123})
            incoming$.next({event: 'subscriptionUp', user: {username: 'bob'}, clientId: 'bob-client', subscriptionId: 'bob-sub'})

            assert.equal(assetManager.remove.mock.callCount(), 0)
            assert.equal(assetManager.createFolder.mock.callCount(), 0)
            assert.ok(received.some(({hb}) => hb === 123))
            assert.ok(received.some(({subscriptionId, data}) => subscriptionId === 'bob-sub' && data.username === 'bob'))
        })
    }

    test('forwards valid removal batches and folder creation with their owner', () => {
        const paths = [['projects', 'alice', 'assets', 'one'], ['projects', 'alice', 'assets', 'two']]
        const path = ['projects', 'alice', 'assets', 'folder']

        incoming$.next(command({remove: paths}))
        incoming$.next(command({createFolder: path}))

        const owner = {username: 'alice', clientId: 'alice-client', subscriptionId: 'alice-sub'}
        assert.deepEqual(callsOf(assetManager.remove), [[{...owner, paths}]])
        assert.deepEqual(callsOf(assetManager.createFolder), [[{...owner, path}]])
    })

    test('a throwing command leaves heartbeats and another user\'s subscription working', () => {
        assetManager.reload.mock.mockImplementationOnce(() => { throw new Error('command failed') })

        incoming$.next(command({reload: true}))
        incoming$.next({hb: 123})
        incoming$.next({event: 'subscriptionUp', user: {username: 'bob'}, clientId: 'bob-client', subscriptionId: 'bob-sub'})

        assert.ok(received.some(({hb}) => hb === 123))
        assert.ok(received.some(({subscriptionId, data}) => subscriptionId === 'bob-sub' && data.username === 'bob'))
    })

})

const command = data => ({user: {username: 'alice'}, clientId: 'alice-client', subscriptionId: 'alice-sub', data})

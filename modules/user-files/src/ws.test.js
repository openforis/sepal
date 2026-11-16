import assert from 'node:assert/strict'
import {existsSync, mkdtempSync} from 'node:fs'
import {mkdir, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {after, before, describe, mock, test} from 'node:test'

import {filter, firstValueFrom, ReplaySubject, Subject, timeout} from 'rxjs'

import {configureNoLogging} from '#sepal/log'

// One gateway connection carries the commands of many users. Over the real protocol, watcher and filesystem, a
// malformed or failing command affects that command alone.

const POLL_INTERVAL_MS = 20
const WAIT_MS = 5000

const homeDir = mkdtempSync(join(tmpdir(), 'user-files-'))

mock.module('./config.js', {
    exports: {homeDir, pollIntervalMilliseconds: POLL_INTERVAL_MS}
})

const {default: ws} = await import('./ws.js')

before(() => configureNoLogging())

after(() => rm(homeDir, {recursive: true, force: true}))

describe('commands on a shared gateway connection', () => {
    test('keep answering heartbeats and serving another user after a malformed command', async t => {
        await aFolder('ann', 'project')
        await aFolder('ben', 'project')
        const gateway = await connect(t)
        gateway.send(command('ann', {monitor: ['project']}))
        await gateway.received(listing('ann', 'project'))

        gateway.send(command('ann', {unmonitor: 123}))
        gateway.send(command('ann', {monitor: [123]}))
        gateway.send(command('ann', {unmonitor: 'elsewhere'}))
        gateway.send({hb: 7})
        gateway.send(command('ben', {monitor: 'project'}))

        await gateway.received(({hb}) => hb === 7)
        await gateway.received(listing('ben', 'project'))
    })

    test('reject a malformed command whole, leaving existing monitors running and starting none', async t => {
        await aFolder('cora', 'project')
        await aFolder('cora', 'other')
        await aFolder('cora', 'third')
        const gateway = await connect(t)
        gateway.send(command('cora', {monitor: ['project']}))
        await gateway.received(listing('cora', 'project'))

        for (const data of [
            {monitor: ['other', 7], reset: true},
            {monitor: ['other', null]},
            {monitor: [['other']]},
            {monitor: {path: 'other'}},
            {monitor: null},
            {monitor: ['other'], reset: 'yes'},
            {unmonitor: ['project', null]},
            {unmonitor: [['project']]}
        ]) {
            gateway.send(command('cora', data))
        }
        await aFile('cora', 'project/later.txt')

        await gateway.received(listing('cora', 'project', {containing: 'later.txt'}))
        gateway.send(command('cora', {monitor: 'third'}))
        await gateway.received(listing('cora', 'third'))
        await polls(5)
        assert.equal(gateway.messages().some(listing('cora', 'other')), false)
    })

    test('remove nothing of a batch with a malformed path', async t => {
        await aFile('dina', 'project/kept.txt')
        await aFile('dina', 'project/removed.txt')
        const gateway = await connect(t)

        gateway.send(command('dina', {remove: ['project/kept.txt', 42]}))
        gateway.send(command('dina', {remove: ['project/removed.txt']}))

        await until(() => !existsSync(join(homeDir, 'dina', 'project', 'removed.txt')))
        assert.equal(existsSync(join(homeDir, 'dina', 'project', 'kept.txt')), true)
    })

    test('monitor the root given as an empty path, and slash-prefixed paths', async t => {
        await aFolder('emma', 'project')
        const gateway = await connect(t)

        gateway.send(command('emma', {monitor: ''}))
        gateway.send(command('emma', {monitor: ['/', '/project']}))

        await gateway.received(listing('emma', '', {containing: 'project'}))
        await gateway.received(listing('emma', '/', {containing: 'project'}))
        await gateway.received(listing('emma', '/project'))
    })

    test('reset only the subscription asking, which can then monitor again', async t => {
        await aFolder('fay', 'project')
        const gateway = await connect(t)
        gateway.send(command('fay', {monitor: ['', 'project', '/project']}, 'browser'))
        gateway.send(command('fay', {monitor: ['project']}, 'destination'))
        for (const path of ['', 'project', '/project']) {
            await gateway.received(listing('fay', path, {subscription: 'browser'}))
        }
        await gateway.received(listing('fay', 'project', {subscription: 'destination'}))

        gateway.send(command('fay', {monitor: [], reset: true}, 'browser'))
        const sinceReset = gateway.messages().length
        await aFile('fay', 'project/after-reset.txt')

        await gateway.received(listing('fay', 'project', {subscription: 'destination', containing: 'after-reset.txt'}))
        await polls(5)
        assert.deepEqual(gateway.messages().slice(sinceReset).filter(fromSubscription('fay', 'browser')), [])
        gateway.send(command('fay', {monitor: ['project']}, 'browser'))
        await gateway.received(listing('fay', 'project', {subscription: 'browser', containing: 'after-reset.txt'}))
    })

    for (const event of ['subscriptionDown', 'clientDown']) {
        test(`can reuse identities after repeated ${event} events without disturbing other monitors`, async t => {
            await aFolder('iris', 'project')
            await aFolder('jo', 'project')
            const gateway = await connect(t)
            gateway.send(command('iris', {monitor: 'project'}, 'destination'))
            gateway.send(command('jo', {monitor: 'project'}))
            await gateway.received(listing('iris', 'project', {subscription: 'destination'}))
            await gateway.received(listing('jo', 'project'))

            for (const cycle of [0, 1, 2]) {
                const file = `${event}-${cycle}.txt`
                await aFile('iris', `project/${file}`)
                gateway.send(command('iris', {monitor: 'project'}, 'browser'))
                await gateway.received(listing('iris', 'project', {subscription: 'browser', containing: file}))

                gateway.send({...command('iris', undefined, 'browser'), event})
                const sinceClose = gateway.messages().length
                const later = `${event}-closed-${cycle}.txt`
                await aFile('iris', `project/${later}`)
                await aFile('jo', `project/${later}`)
                await gateway.received(listing('jo', 'project', {containing: later}))
                if (event === 'subscriptionDown') {
                    await gateway.received(listing('iris', 'project', {subscription: 'destination', containing: later}))
                }
                await polls(3)
                const closedMessages = gateway.messages().slice(sinceClose).filter(message =>
                    event === 'clientDown'
                        ? message.clientId === 'iris-client'
                        : fromSubscription('iris', 'browser')(message)
                )
                assert.deepEqual(closedMessages, [])
            }
        })
    }

    test('closing a connection stops its monitors while another connection keeps watching', async t => {
        await aFolder('kel', 'project')
        const closing = await connect(t)
        const remaining = await connect(t)
        for (const gateway of [closing, remaining]) {
            gateway.send(command('kel', {monitor: 'project'}))
            await gateway.received(listing('kel', 'project'))
        }

        closing.close()
        const sinceClose = closing.messages().length
        await aFile('kel', 'project/after-close.txt')

        await remaining.received(listing('kel', 'project', {containing: 'after-close.txt'}))
        await polls(3)
        assert.deepEqual(closing.messages().slice(sinceClose), [])
    })

    test('keep serving commands after one fails unexpectedly', async t => {
        await aFolder('gil', 'project')
        const gateway = await connect(t)

        gateway.send({data: {monitor: 'project'}})
        gateway.send({event: 'clientDown'})
        gateway.send({hb: 9})
        gateway.send(command('gil', {monitor: 'project'}))

        await gateway.received(({hb}) => hb === 9)
        await gateway.received(listing('gil', 'project'))
    })

    test('keep serving commands after an operation fails', async t => {
        await aFile('hal', 'project/kept.txt')
        await aFile('hal', 'project/removed.txt')
        const gateway = await connect(t)

        gateway.send(command('hal', {remove: ''}))
        gateway.send(command('hal', {remove: 'project/missing.txt'}))
        gateway.send(command('hal', {monitor: 'project/kept.txt'}))
        await gateway.received(message => message.data?.path === 'project/kept.txt' && message.data.error === 'ENOTDIR')
        gateway.send(command('hal', {remove: 'project/removed.txt'}))
        gateway.send(command('hal', {monitor: 'project'}))

        await until(() => !existsSync(join(homeDir, 'hal', 'project', 'removed.txt')))
        await gateway.received(listing('hal', 'project', {containing: 'kept.txt'}))
    })
})

// The gateway's side of a connection to the module: once the module is ready, commands go in and what the module
// sends comes out.
const connect = async t => {
    const incoming$ = new Subject()
    const received$ = new ReplaySubject()
    const messages = []
    const subscription = ws({arg$: incoming$}).subscribe(message => {
        messages.push(message)
        received$.next(message)
    })
    t.after(() => subscription.unsubscribe())
    const gateway = {
        send: message => incoming$.next(message),
        close: () => subscription.unsubscribe(),
        // The first message sent so far, or within the wait, that matches.
        received: matches => firstValueFrom(received$.pipe(filter(matches), timeout(WAIT_MS))),
        messages: () => [...messages]
    }
    await gateway.received(({ready}) => ready)
    return gateway
}

const command = (username, data, subscription = 'subscription') => ({
    user: {username},
    clientId: `${username}-client`,
    subscriptionId: `${username}-${subscription}`,
    data
})

const fromSubscription = (username, subscription) => message =>
    message.clientId === `${username}-client` && message.subscriptionId === `${username}-${subscription}`

const listing = (username, path, {subscription = 'subscription', containing} = {}) => message =>
    fromSubscription(username, subscription)(message)
    && message.data?.path === path
    && !!message.data.items
    && (!containing || Object.hasOwn(message.data.items, containing))

const aFolder = (username, path) =>
    mkdir(join(homeDir, username, path), {recursive: true})

const aFile = async (username, path) => {
    await mkdir(dirname(join(homeDir, username, path)), {recursive: true})
    await writeFile(join(homeDir, username, path), '')
}

const polls = count =>
    new Promise(resolve => setTimeout(resolve, count * POLL_INTERVAL_MS))

// Waits until the condition holds, failing the test when it still does not after the wait.
const until = async (condition, waited = 0) => {
    if (condition()) {
        return
    }
    assert.ok(waited < WAIT_MS, 'the condition never held')
    await polls(1)
    return until(condition, waited + POLL_INTERVAL_MS)
}

// Parity test: compares user-node endpoints to the Java `user` module over HTTP.
// Runs only when both services are reachable (RUN_PARITY=1); otherwise skipped.
// IMPORTANT: run jest with --forceExit — the UserLocked test opens an amqplib connection that
// leaves an open handle, so jest otherwise hangs at exit. Mutation/activate tests need their
// throwaway users (_parity_mut, _act_java/_act_node) seeded by the harness before each run.
import amqp from 'amqplib'
import http from 'http'

const JAVA = process.env.JAVA_USER_URL || 'http://user'
const NODE = process.env.NODE_USER_URL || 'http://user-node'
const run = process.env.RUN_PARITY === '1' ? describe : describe.skip

const get = (base, path, headers) => new Promise((resolve, reject) => {
    http.get(`${base}${path}`, {headers}, res => {
        let data = ''
        res.on('data', c => data += c)
        res.on('end', () => resolve({status: res.statusCode, body: data ? JSON.parse(data) : null}))
    }).on('error', reject)
})

const adminHeader = {'sepal-user': JSON.stringify({username: 'sepaladmin', roles: ['application_admin']})}

const post = (base, path, form, headers) => new Promise((resolve, reject) => {
    const body = new URLSearchParams(form).toString()
    const req = http.request(`${base}${path}`, {method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body), ...headers}},
    res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body: d ? JSON.parse(d) : null})) })
    req.on('error', reject); req.write(body); req.end()
})

run('read-endpoint parity (Java vs user-node)', () => {
    test('GET /current returns identical JSON for the same user', async () => {
        const headers = {'sepal-user': JSON.stringify({username: 'lookap1', roles: []})}
        const [java, node] = await Promise.all([get(JAVA, '/current', headers), get(NODE, '/current', headers)])
        expect(node.status).toBe(java.status)
        expect(node.body).toEqual(java.body)
    })

    test('GET /info?username=lookap1 matches', async () => {
        const [java, node] = await Promise.all([
            get(JAVA, '/info?username=lookap1', adminHeader),
            get(NODE, '/info?username=lookap1', adminHeader)
        ])
        expect(node.status).toBe(java.status)
        expect(node.body).toEqual(java.body)
    })

    test('GET /list returns the same set of usernames', async () => {
        const [java, node] = await Promise.all([get(JAVA, '/list', adminHeader), get(NODE, '/list', adminHeader)])
        expect(node.status).toBe(java.status)
        const usernames = body => body.map(u => u.username).sort()
        expect(usernames(node.body)).toEqual(usernames(java.body))
        const pick = (body, u) => body.find(x => x.username === u)
        expect(pick(node.body, 'lookap1')).toEqual(pick(java.body, 'lookap1'))
    })

    test('GET /mostRecentLoginByUser uses the same date format and value (lookap2)', async () => {
        const [java, node] = await Promise.all([
            get(JAVA, '/mostRecentLoginByUser', adminHeader),
            get(NODE, '/mostRecentLoginByUser', adminHeader)
        ])
        expect(node.status).toBe(java.status)
        expect(node.body.lookap2).toBe(java.body.lookap2)
        expect(typeof node.body.lookap2).toBe('string')
    })

    test('GET /mostRecentLogin?username= returns Java {timestamp} shape', async () => {
        const [java, node] = await Promise.all([
            get(JAVA, '/mostRecentLogin?username=admin', adminHeader),
            get(NODE, '/mostRecentLogin?username=admin', adminHeader)
        ])
        expect(node.body).toEqual(java.body)
    })

    test('GET /mostRecentLoginByUser excludes system users (no sepaladmin key)', async () => {
        const [java, node] = await Promise.all([
            get(JAVA, '/mostRecentLoginByUser', adminHeader),
            get(NODE, '/mostRecentLoginByUser', adminHeader)
        ])
        expect(Object.keys(node.body).sort()).toEqual(Object.keys(java.body).sort())
    })

    test('GET /email-notifications-enabled for an unknown email matches Java (false)', async () => {
        const [java, node] = await Promise.all([
            get(JAVA, '/email-notifications-enabled/nobody@nowhere.test', adminHeader),
            get(NODE, '/email-notifications-enabled/nobody@nowhere.test', adminHeader)
        ])
        expect(node.body).toEqual(java.body)
    })
})

const PARITY_USER = '_parity_mut'

run('mutation parity + events (Java vs user-node)', () => {
    test('POST /current/details returns matching JSON (modulo updateTime)', async () => {
        const headers = {'sepal-user': JSON.stringify({username: PARITY_USER, roles: []})}
        const form = {name: 'Parity Name', email: 'p@x.org', organization: 'POrg', emailNotificationsEnabled: 'true'}
        const java = await post(JAVA, '/current/details', form, headers)
        const node = await post(NODE, '/current/details', form, headers)
        expect(node.status).toBe(java.status)
        expect(java.headers['sepal-user-updated']).toBe(PARITY_USER)
        expect(node.headers['sepal-user-updated']).toBe(PARITY_USER)
        const strip = u => ({...u, updateTime: null})
        expect(strip(node.body)).toEqual(strip(java.body))
    })

    test('POST /lock publishes user.UserLocked with the username to sepal.topic', async () => {
        const conn = await amqp.connect(process.env.AMQP_URL || 'amqp://rabbitmq')
        const ch = await conn.createChannel()
        const {queue} = await ch.assertQueue('', {exclusive: true})
        await ch.bindQueue(queue, 'sepal.topic', 'user.UserLocked')
        const received = new Promise(resolve => ch.consume(queue, m => resolve(JSON.parse(m.content.toString())), {noAck: true}))
        const admin = {'sepal-user': JSON.stringify({username: 'sepaladmin', roles: ['application_admin']})}
        const res = await post(NODE, '/lock', {username: PARITY_USER}, admin)
        expect(res.status).toBe(200)
        expect(res.body.status).toBe('LOCKED')
        const event = await received
        expect(event.username).toBe(PARITY_USER)
        expect(event.status).toBe('LOCKED')
        await ch.close(); await conn.close()
    })
})

run('activate parity (Java vs user-node)', () => {
    // Fixtures _act_java / _act_node are seeded + dropped by the shell harness (Step 2).
    test('POST /activate flips PENDING->ACTIVE and returns the same userToMap shape', async () => {
        const java = await post(JAVA, '/activate', {token: 'tok-act-java', password: 'activate-pw-123'}, {})
        const node = await post(NODE, '/activate', {token: 'tok-act-node', password: 'activate-pw-123'}, {})
        expect(java.status).toBe(200)
        expect(node.status).toBe(200)
        expect(java.body.status).toBe('ACTIVE')
        expect(node.body.status).toBe('ACTIVE')
        expect(Object.keys(node.body).sort()).toEqual(Object.keys(java.body).sort())
    })

    test('POST /activate rejects a bogus token and a too-short password with 400', async () => {
        const badToken = await post(NODE, '/activate', {token: 'nope-nope', password: 'activate-pw-123'}, {})
        const badPw = await post(NODE, '/activate', {token: 'tok-act-node', password: 'short'}, {})
        expect(badToken.status).toBe(400)
        expect(badPw.status).toBe(400)
    })
})

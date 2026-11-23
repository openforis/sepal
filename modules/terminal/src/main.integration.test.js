import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {connect, createServer} from 'node:net'
import {tmpdir} from 'node:os'
import {test} from 'node:test'
import {setTimeout as delay} from 'node:timers/promises'
import {fileURLToPath} from 'node:url'

for (const path of ['/a/b', '/alice-1']) {
    test(`keeps serving after an invalid WebSocket frame on ${path}`, {timeout: 10000}, async t => {
        const {port, child, output} = await startServer(t)

        await sendUnmaskedFrame(port, path)

        try {
            const response = await fetch(`http://127.0.0.1:${port}/`, {signal: AbortSignal.timeout(2000)})
            assert.equal(response.status, 404)
            assert.equal(child.exitCode, null)
        } catch (error) {
            t.diagnostic(output())
            throw error
        }
    })
}

const startServer = async t => {
    const reservation = createServer()
    reservation.listen(0, '127.0.0.1')
    await once(reservation, 'listening')
    const {port} = reservation.address()
    await new Promise(resolve => reservation.close(resolve))
    const child = spawn(process.execPath, ['src/main.js'], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env: {
            ...process.env,
            IP: '127.0.0.1',
            HTTP_PORT: String(port),
            HOME_DIR: tmpdir(),
            SSH_SCRIPT_PATH: '/bin/false'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    })
    t.after(async () => {
        if (child.exitCode === null && child.signalCode === null) {
            const exited = once(child, 'exit')
            child.kill()
            await exited
        }
    })
    let output = ''
    await new Promise((resolve, reject) => {
        child.once('error', reject)
        child.once('exit', code => reject(new Error(`Server exited with ${code}: ${output}`)))
        child.stdout.on('data', chunk => {
            output += chunk
            if (output.includes('Terminal server listening')) resolve()
        })
        child.stderr.on('data', chunk => { output += chunk })
    })
    while (true) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/`, {signal: t.signal})
            await response.body.cancel()
            break
        } catch (error) {
            if (child.exitCode !== null || child.signalCode !== null || t.signal.aborted) throw error
            await delay(10, undefined, {signal: t.signal})
        }
    }
    return {port, child, output: () => output}
}

const sendUnmaskedFrame = (port, path) =>
    new Promise((resolve, reject) => {
        const socket = connect(port, '127.0.0.1')
        socket.setTimeout(2000, () => socket.destroy(new Error('WebSocket exchange timed out')))
        socket.once('error', reject)
        socket.once('close', resolve)
        socket.once('connect', () => socket.write([
            `GET ${path} HTTP/1.1`,
            'Host: localhost',
            'Connection: Upgrade',
            'Upgrade: websocket',
            'Sec-WebSocket-Version: 13',
            'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
            '', ''
        ].join('\r\n')))
        let response = ''
        socket.on('data', chunk => {
            response += chunk.toString('latin1')
            if (response.includes('\r\n\r\n')) {
                if (!response.startsWith('HTTP/1.1 101')) {
                    socket.destroy(new Error(`Upgrade failed: ${response}`))
                    return
                }
                // An unmasked text frame violates the client-to-server WebSocket protocol.
                socket.end(Buffer.from([0x81, 0x01, 0x61]))
                socket.removeAllListeners('data')
            }
        })
    })

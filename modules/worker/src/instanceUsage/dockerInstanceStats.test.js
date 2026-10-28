import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {instanceName} from '../instanceName.js'
import {createDockerInstanceStats} from './dockerInstanceStats.js'

const config = {dockerPort: 2375, dockerEntryPoint: 'v1.44'}

const session = {
    id: 'sess-1',
    username: 'alice',
    workerType: 'sandbox',
    instance: {id: 'i-0abc', host: '1.2.3.4'},
}

describe('containerStats', () => {
    it('GETs one-shot stats for the session container by naming convention', async () => {
        const calls = []
        const fetcher = async (...args) => {
            calls.push(args)
            return {cpu_stats: {}}
        }
        const stats = createDockerInstanceStats({config, fetcher})
        const result = await stats.containerStats(session)
        assert.deepEqual(result, {cpu_stats: {}})
        const [baseUrl, path, options] = calls[0]
        assert.equal(baseUrl, 'http://1.2.3.4:2375/v1.44')
        assert.equal(path, `containers/sandbox.alice.${instanceName('sess-1')}.i-0abc/stats`)
        assert.deepEqual(options.query, {stream: false, 'one-shot': true})
        assert.equal(options.timeoutMs, 5000)
    })

    it('uses defaultDaemonHost when set (local hosting) and strips the instance- prefix', async () => {
        const calls = []
        const fetcher = async (...args) => {
            calls.push(args)
            return {}
        }
        const stats = createDockerInstanceStats({config, defaultDaemonHost: 'host.docker.internal', fetcher})
        await stats.containerStats({
            ...session,
            workerType: 'sandbox',
            instance: {id: '3f2b8c1a-9d44-4e21-8f77-2c6a5b0e91d3', host: 'alias-42'},
        })
        const [baseUrl, path] = calls[0]
        assert.equal(baseUrl, 'http://host.docker.internal:2375/v1.44')
        assert.equal(
            path,
            `containers/sandbox.alice.${instanceName('sess-1')}.3f2b8c1a-9d44-4e21-8f77-2c6a5b0e91d3/stats`
        )
    })
})

describe('gpuStats', () => {
    it('execs nvidia-smi in the container and returns raw output', async () => {
        const calls = []
        const fetcher = async (baseUrl, path, options) => {
            calls.push([baseUrl, path, options])
            return path.startsWith('exec/') ? '45, 1024\r\n' : {Id: 'exec-1'}
        }
        const stats = createDockerInstanceStats({config, fetcher})
        const result = await stats.gpuStats(session)
        assert.equal(result, '45, 1024\r\n')
        assert.equal(
            calls[0][1],
            `containers/sandbox.alice.${instanceName('sess-1')}.i-0abc/exec`
        )
        assert.deepEqual(
            calls[0][2].body.Cmd,
            ['nvidia-smi', '--query-gpu=utilization.gpu,memory.used', '--format=csv,noheader,nounits']
        )
        assert.equal(calls[1][1], 'exec/exec-1/start')
    })
})

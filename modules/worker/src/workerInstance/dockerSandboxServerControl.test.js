import {instanceName} from '../instanceName.js'
import {createDockerSandboxServerControl} from './dockerSandboxServerControl.js'

const config = {dockerPort: 2375, dockerEntryPoint: 'v1.44'}

const session = {
    id: 'sess-1',
    username: 'alice',
    workerType: 'sandbox',
    instance: {id: 'i-0abc', host: '1.2.3.4'},
}

const fetcherReturning = (calls, exitCode) => async (baseUrl, path, options) => {
    calls.push([baseUrl, path, options])
    if (path.endsWith('/exec')) return {Id: 'exec-1'}
    if (path.endsWith('/start')) return ''
    if (path.endsWith('/json')) return {ExitCode: exitCode}
    throw new Error(`unexpected path ${path}`)
}

describe('startServer', () => {
    it('execs the start script for the endpoint in the session container', async () => {
        const calls = []
        const control = createDockerSandboxServerControl({config, fetcher: fetcherReturning(calls, 0)})
        await control.startServer(session, 'jupyter')
        expect(calls[0][0]).toBe('http://1.2.3.4:2375/v1.44')
        expect(calls[0][1]).toBe(`containers/sandbox.alice.${instanceName('sess-1')}.i-0abc/exec`)
        expect(calls[0][2].body.Cmd).toEqual(['/script/sandbox-server.sh', 'start', 'jupyter'])
        expect(calls[0][2].body.Tty).toBe(false)
        expect(calls[1][1]).toBe('exec/exec-1/start')
        expect(calls[2][1]).toBe('exec/exec-1/json')
    })

    it('rejects when the start script exits non-zero', async () => {
        const calls = []
        const control = createDockerSandboxServerControl({config, fetcher: fetcherReturning(calls, 1)})
        await expect(control.startServer(session, 'jupyter')).rejects.toThrow(/jupyter/)
    })

    it('rejects when the exec inspect yields no exit code', async () => {
        const fetcher = async (_baseUrl, path) => path.endsWith('/exec') ? {Id: 'exec-1'} : null
        const control = createDockerSandboxServerControl({config, fetcher})
        await expect(control.startServer(session, 'shiny')).rejects.toThrow(/shiny/)
    })

    it('uses defaultDaemonHost when set (local hosting)', async () => {
        const calls = []
        const control = createDockerSandboxServerControl({
            config, defaultDaemonHost: 'host.docker.internal', fetcher: fetcherReturning(calls, 0)})
        await control.startServer({...session, instance: {id: 'abc-123', host: 'alias-42'}}, 'rstudio')
        expect(calls[0][0]).toBe('http://host.docker.internal:2375/v1.44')
        expect(calls[0][1]).toBe(`containers/sandbox.alice.${instanceName('sess-1')}.abc-123/exec`)
    })

    it('rejects for a non-sandbox session', async () => {
        const control = createDockerSandboxServerControl({config, fetcher: async () => ({Id: 'x'})})
        await expect(control.startServer({...session, workerType: 'task-executor'}, 'shiny'))
            .rejects.toThrow(/Not a sandbox session/)
    })
})

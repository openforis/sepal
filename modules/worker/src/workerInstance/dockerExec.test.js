import {dockerExec} from './dockerExec.js'

const BASE_URL = 'http://10.0.0.1:2375/v1.44'

describe('dockerExec', () => {
    it('runs the command in the container and returns its output and exit code', async () => {
        const calls = []
        const fetcher = recordingFetcher(calls, {output: 'out/a.tif\r\n', exitCode: 3})

        const result = await dockerExec(BASE_URL, 'sidecar-1', ['sepal-data', 'pending-uploads'], {timeoutMs: 1000, fetcher})

        expect(result).toEqual({exitCode: 3, output: 'out/a.tif\r\n'})
        expect(calls.map(([baseUrl, path, options]) => [baseUrl, path, options.method ?? 'GET'])).toEqual([
            [BASE_URL, 'containers/sidecar-1/exec', 'POST'],
            [BASE_URL, 'exec/exec-1/start', 'POST'],
            [BASE_URL, 'exec/exec-1/json', 'GET'],
        ])
        expect(calls[0][2].body).toMatchObject({Tty: true, Cmd: ['sepal-data', 'pending-uploads']})
        expect(calls.every(([, , options]) => options.timeoutMs === 1000)).toBe(true)
    })

    it('returns empty output when the command printed nothing', async () => {
        const fetcher = recordingFetcher([], {output: null, exitCode: 0})

        const result = await dockerExec(BASE_URL, 'sidecar-1', ['true'], {fetcher})

        expect(result).toEqual({exitCode: 0, output: ''})
    })

    it('returns output that happens to be valid JSON as the text it printed', async () => {
        const fetcher = recordingFetcher([], {output: 2024, exitCode: 0})

        const {output} = await dockerExec(BASE_URL, 'sidecar-1', ['ls'], {fetcher})

        expect(output).toBe('2024')
    })
})

const recordingFetcher = (calls, {output, exitCode}) => async (baseUrl, path, options = {}) => {
    calls.push([baseUrl, path, options])
    if (path.endsWith('/exec')) return {Id: 'exec-1'}
    if (path.endsWith('/start')) return output
    if (path.endsWith('/json')) return {ExitCode: exitCode}
    throw new Error(`unexpected path ${path}`)
}

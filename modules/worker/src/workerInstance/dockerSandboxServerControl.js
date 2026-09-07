// dockerSandboxServerControl — starts one of a sandbox container's on-demand servers
// (rstudio | shiny | jupyter) over the Docker Engine REST API. Same channel as
// dockerInstanceStats: no agent on the instance.
//
// The exec runs /script/sandbox-server.sh, which returns only once the endpoint's port is
// listening. Its EXIT CODE is the whole signal, so it is read back from GET /exec/{id}/json —
// dockerInstanceProvisioner.waitUntilInitialized ignores exit codes, and a start that timed out
// must not be indistinguishable from one that succeeded.

import {containerName as buildContainerName} from '../containerName.js'
import {dockerFetch} from './dockerApi.js'
import {SANDBOX} from './workerTypes.js'

// Jupyter is the slow one; the script's own poll gives up well before this.
const START_TIMEOUT_MS = 90_000
const INSPECT_TIMEOUT_MS = 5_000

const createDockerSandboxServerControl = ({config, defaultDaemonHost = null, fetcher = dockerFetch}) => {
    const {dockerPort, dockerEntryPoint} = config

    const baseUrl = session =>
        `http://${defaultDaemonHost ?? session.instance.host}:${dockerPort}/${dockerEntryPoint}`

    const containerName = session => {
        if (session.workerType !== SANDBOX) {
            throw new Error(`Not a sandbox session: ${session.id}`)
        }
        return buildContainerName({
            image: SANDBOX, username: session.username, sessionId: session.id, instanceId: session.instance.id,
        })
    }

    const startServer = async (session, endpoint) => {
        const name = containerName(session)
        const url = baseUrl(session)
        const execResponse = await fetcher(url, `containers/${name}/exec`, {
            method: 'POST',
            body: {
                AttachStdin: false,
                AttachStdout: true,
                AttachStderr: true,
                Tty: false,
                Cmd: ['/script/sandbox-server.sh', 'start', endpoint],
            },
            timeoutMs: START_TIMEOUT_MS,
        })
        await fetcher(url, `exec/${execResponse.Id}/start`, {
            method: 'POST',
            body: {Detach: false, Tty: false},
            timeoutMs: START_TIMEOUT_MS,
        })
        const inspect = await fetcher(url, `exec/${execResponse.Id}/json`, {
            timeoutMs: INSPECT_TIMEOUT_MS,
        })
        if (inspect?.ExitCode !== 0) {
            throw new Error(`Failed to start ${endpoint} in ${name}: exit code ${inspect?.ExitCode}`)
        }
    }

    return {startServer}
}

export {createDockerSandboxServerControl}

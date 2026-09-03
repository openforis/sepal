// dockerInstanceStats — reads resource usage of a session's worker container over the
// Docker Engine REST API (the channel the provisioner already uses; no agent on the
// instance).
//
//   containerStats(session) — GET /containers/{name}/stats?stream=false&one-shot=true.
//     one-shot returns immediately (no 1s wait); CPU/net are computed as deltas between
//     sampler ticks (computeUsage.js), so precpu_stats being zeroed is irrelevant.
//   gpuStats(session)       — exec nvidia-smi in the container (the NVIDIA runtime injects
//     the binary on GPU instances); raw CSV text, parsed by computeUsage.parseGpuCsv.
//   ptyStats(session)       — exec `stat` over /dev/pts/*, the terminal interaction signal
//     (docs/session-expiration-model.md §4b). Program output advances a pty's mtime; only USER
//     INPUT advances its atime, so a job printing a thousand log lines to an abandoned terminal
//     buys no time and one keystroke does.
//
// THE PTY EXEC MUST NOT USE Tty: true. A Tty exec allocates a pty INSIDE the container, which
// appears in /dev/pts with atime = the moment of the exec — the sampler's own measurement would be
// indistinguishable from a keystroke, every session would be extended forever, and nothing would
// log an error. gpuStats does use Tty: true (unchanged), which is exactly why the two must not be
// made to share an exec. Tty: false multiplexes stdout in 8-byte frame headers, so the output is
// framed rather than raw — parsePtyStat extracts records rather than parsing lines.
//
// Container name convention: see ../containerName.js.
// defaultDaemonHost — local hosting only: all instances share the dev daemon and
// instance.host is a network alias (mirrors dockerInstanceProvisioner.normalizeInstance).

import {containerName as buildContainerName} from '../containerName.js'
import {dockerFetch} from '../workerInstance/dockerApi.js'
import {SANDBOX, TASK_EXECUTOR} from '../workerInstance/workerTypes.js'

const IMAGE_BY_WORKER_TYPE = {
    [SANDBOX]: 'sandbox',
    [TASK_EXECUTOR]: 'task',
}

const GPU_QUERY_COMMAND = ['nvidia-smi', '--query-gpu=utilization.gpu,memory.used', '--format=csv,noheader,nounits']

// %X = atime (user input), %Z = ctime (allocation time — the exec-pty discriminator). The glob
// needs a shell; stderr is discarded so a container with no ptys yields empty output, not an error.
const PTY_STAT_COMMAND = ['/bin/sh', '-c', 'stat -c "%X %Z %n" /dev/pts/[0-9]* 2>/dev/null']

const STATS_TIMEOUT_MS = 5000
const GPU_EXEC_TIMEOUT_MS = 15000
const PTY_EXEC_TIMEOUT_MS = 15000

const createDockerInstanceStats = ({config, defaultDaemonHost = null, fetcher = dockerFetch}) => {
    const {dockerPort, dockerEntryPoint} = config

    const baseUrl = session =>
        `http://${defaultDaemonHost ?? session.instance.host}:${dockerPort}/${dockerEntryPoint}`

    const containerName = session => {
        const image = IMAGE_BY_WORKER_TYPE[session.workerType]
        if (!image) {
            throw new Error(`Unknown worker type: ${session.workerType}`)
        }
        return buildContainerName({
            image, username: session.username, sessionId: session.id, instanceId: session.instance.id,
        })
    }

    const containerStats = async session =>
        await fetcher(baseUrl(session), `containers/${containerName(session)}/stats`, {
            query: {stream: false, 'one-shot': true},
            timeoutMs: STATS_TIMEOUT_MS,
        })

    const gpuStats = async session => {
        const url = baseUrl(session)
        const execResponse = await fetcher(url, `containers/${containerName(session)}/exec`, {
            method: 'POST',
            body: {
                AttachStdin: false,
                AttachStdout: true,
                AttachStderr: true,
                Tty: true,
                Cmd: GPU_QUERY_COMMAND,
            },
            timeoutMs: GPU_EXEC_TIMEOUT_MS,
        })
        return await fetcher(url, `exec/${execResponse.Id}/start`, {
            method: 'POST',
            body: {Detach: false, Tty: true},
            timeoutMs: GPU_EXEC_TIMEOUT_MS,
        })
    }

    const ptyStats = async session => {
        const url = baseUrl(session)
        const execResponse = await fetcher(url, `containers/${containerName(session)}/exec`, {
            method: 'POST',
            body: {
                AttachStdin: false,
                AttachStdout: true,
                AttachStderr: false,
                Tty: false,
                Cmd: PTY_STAT_COMMAND,
            },
            timeoutMs: PTY_EXEC_TIMEOUT_MS,
        })
        return await fetcher(url, `exec/${execResponse.Id}/start`, {
            method: 'POST',
            body: {Detach: false, Tty: false},
            timeoutMs: PTY_EXEC_TIMEOUT_MS,
        })
    }

    return {containerStats, gpuStats, ptyStats}
}

export {createDockerInstanceStats}

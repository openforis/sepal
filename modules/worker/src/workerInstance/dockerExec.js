// dockerExec — runs a command in a running container over the Docker Engine REST API and returns
// what it printed together with its exit code. With Tty the start response is the raw output
// rather than a multiplexed stream, so it needs no demultiplexing.

import {dockerFetch} from './dockerApi.js'

export const dockerExec = async (baseUrl, containerName, cmd, {timeoutMs, fetcher = dockerFetch} = {}) => {
    const {Id} = await fetcher(baseUrl, `containers/${containerName}/exec`, {
        method: 'POST',
        body: {AttachStdout: true, AttachStderr: true, Tty: true, Cmd: cmd},
        timeoutMs,
    })
    const output = await fetcher(baseUrl, `exec/${Id}/start`, {
        method: 'POST',
        body: {Detach: false, Tty: true},
        timeoutMs,
    })
    const {ExitCode} = await fetcher(baseUrl, `exec/${Id}/json`, {timeoutMs})
    return {exitCode: ExitCode, output: asText(output)}
}

// dockerFetch parses a body that happens to be valid JSON, such as a lone number.
const asText = output =>
    output === null || output === undefined
        ? ''
        : typeof output === 'string' ? output : JSON.stringify(output)

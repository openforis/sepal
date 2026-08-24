// dockerApi — minimal wrapper around global fetch for Docker Engine REST API calls.
// Shared by the provisioner (dockerInstanceProvisioner.js) and the usage sampler
// (../instanceUsage/dockerInstanceStats.js).
// No default timeout (provisions can take minutes); timeoutMs adds an AbortSignal
// for short calls (availability checks, stats sampling).

const dockerFetch = async (baseUrl, path, {method = 'GET', body, query, timeoutMs} = {}) => {
    let url = `${baseUrl}/${path}`
    if (query) {
        const params = new URLSearchParams(query)
        url = `${url}?${params}`
    }
    const init = {method}
    if (body !== undefined) {
        init.body = JSON.stringify(body)
        init.headers = {'Content-Type': 'application/json'}
    }
    if (timeoutMs) {
        init.signal = AbortSignal.timeout(timeoutMs)
    }
    const response = await fetch(url, init)
    // Docker returns 204 No Content for start/delete — no body to parse.
    const text = await response.text()
    // Throw on non-2xx responses. `statusCode` rides the error so callers can tell an authoritative
    // denial (404 no such container) from an inconclusive failure — see instanceStatus.js.
    if (!response.ok) {
        const error = new Error(`Docker API error ${response.status} for ${method} ${url}: ${text}`)
        error.statusCode = response.status
        throw error
    }
    if (!text) return null
    try {
        return JSON.parse(text)
    } catch (_e) {
        // exec/start returns raw stream data — treat as opaque text.
        return text
    }
}

export {dockerFetch}

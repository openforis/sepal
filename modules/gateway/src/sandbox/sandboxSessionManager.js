import {getLogger} from '#sepal/log'

const defaultLog = getLogger('sandboxSessionManager')

// endpoint → sandbox-container port.
const PORT_BY_ENDPOINT = {
    rstudio: 8787,
    shiny: 3838,
    jupyter: 8888
}

const DEFAULT_ENDPOINT = 'shiny' // GUI default (api/apps.js requestSession$/waitForSession$)

// Worker REST status → the status the GUI polls for: only 'STARTED' counts as running.
const toClientStatus = workerStatus =>
    workerStatus === 'ACTIVE' ? 'STARTED' : 'STARTING'

const isEndpoint = endpoint =>
    Object.prototype.hasOwnProperty.call(PORT_BY_ENDPOINT, endpoint)

const createSandboxSessionManager = ({
    workerBaseUrl,
    defaultInstanceType,
    heartbeatIntervalMs = 30000,
    observableTtlMs = 5 * 60 * 1000,
    log = defaultLog,
    fetch = globalThis.fetch
} = {}) => {
    if (!workerBaseUrl) {
        throw new Error('sandboxSessionManager: workerBaseUrl is required')
    }
    if (!defaultInstanceType) {
        throw new Error('sandboxSessionManager: defaultInstanceType is required')
    }

    const baseUrl = workerBaseUrl.replace(/\/+$/, '')

    // username → Map<appKey, {sessionId, host, status, endpoint, appPath, lastSeen}>
    // appKey = appPath ('/sandbox/shiny/foo') or 'endpoint:<endpoint>' for legacy callers.
    const sessionsByUsername = new Map()
    const appKey = ({appPath, endpoint}) => appPath ?? `endpoint:${endpoint}`

    // username → Map<kernelId, {sessionId, host}> — jupyter kernel attribution (resolveTarget).
    const kernelsByUsername = new Map()

    // Per-(username:instanceType) create lock: parallel starts for the same user+type share the
    // in-flight create promise so only ONE worker session is requested. Legacy startEndpoint locks
    // per username.
    const createLockByKey = new Map()

    // Servers this gateway has already had started, keyed 'sessionId:endpoint'. Sandbox servers
    // are started on first use and never stopped, so a hit is permanent for the life of the
    // session — which is what keeps the proxy's per-request path free of a worker round-trip.
    // A gateway restart costs one idempotent re-ensure per pair.
    const startedServers = new Set()
    const startingServers = new Map()

    // Sessions with a real user interaction since their last heartbeat — heartbeatOnce consumes
    // this to flag {interaction: true}, which is what ratchets the session's deadline. A bare
    // heartbeat is deliberately NOT an interaction: it fires for every cached entry regardless of
    // the user doing anything, which is precisely what kept forgotten tabs alive indefinitely.
    //
    // Two things feed it, and NEITHER is "a request was proxied":
    //   - the GUI reporting real input events (pointerdown/keydown/wheel/touchstart) observed
    //     inside an app iframe — recordInteraction, from POST /api/sandbox/interaction;
    //   - proxied requests for a session the GUI declared UNOBSERVABLE (a genuinely cross-origin
    //     app), i.e. today's behaviour, as the §4c fail-open.
    const pendingActivity = new Set()
    const activityKey = (username, sessionId) => `${username}::${sessionId}`
    const recordActivity = (username, sessionId) =>
        sessionId && pendingActivity.add(activityKey(username, sessionId))

    // username::sessionId → expiry timestamp of an `observable: false` declaration.
    //
    // The gateway sees proxied requests but cannot tell "the GUI cannot observe this app" from
    // "the GUI can observe it and nobody is touching it", and those must produce opposite
    // outcomes — so the GUI declares it, per session, refreshed on every report.
    //
    // The default with NO report is observable, i.e. proxied requests extend nothing. That is a
    // deliberate exception to fail-open, chosen on which failure gets noticed: defaulting the
    // other way means one bug in GUI reporting silently reverts every session to the old
    // behaviour, with no symptom at all. This way the same bug shows up as sessions expiring
    // while someone is working — loud, reported, and caught by the notification and the grace
    // period before anything is lost.
    const unobservableUntil = new Map()

    const isUnobservable = (username, sessionId) => {
        const expiry = unobservableUntil.get(activityKey(username, sessionId))
        if (expiry === undefined) {
            return false
        }
        if (expiry <= Date.now()) {
            unobservableUntil.delete(activityKey(username, sessionId))
            return false
        }
        return true
    }

    // recordInteraction — the GUI observed real input in an app iframe bound to this session, or
    // declared that it cannot observe the app at all. Attribution is per session: input in the
    // SEPAL shell (menus, the recipe editor, the file browser, and critically the Dismiss button)
    // reaches no iframe and so extends nothing, because none of it needs a sandbox instance.
    // Sessions whose browser signal has already been seen once — the first report is worth an
    // info line, because it is the evidence that same-origin iframe observation works against the
    // actual JupyterLab/RStudio builds in use, which rollout step 2 exists to establish. After
    // that the signal is routine.
    const interactionSeen = new Set()

    const recordInteraction = ({username, sessionId, observable = true}) => {
        if (!username || !sessionId) {
            return false
        }
        const key = activityKey(username, sessionId)
        if (observable) {
            unobservableUntil.delete(key)
            recordActivity(username, sessionId)
            if (interactionSeen.has(key)) {
                log.debug(() => `App interaction observed for ${username} (session ${sessionId})`)
            } else {
                interactionSeen.add(key)
                log.info(`App interaction observed for ${username} (session ${sessionId}) — first for this session`)
            }
        } else {
            log.debug(() => `App declared unobservable for ${username} (session ${sessionId})`
                + ' — proxied requests will count as interactions')
            unobservableUntil.set(key, Date.now() + observableTtlMs)
        }
        return true
    }

    // A proxied request extends a session ONLY while the GUI says it cannot observe that app.
    // Removing this from the general request path is the whole filter: JupyterLab and RStudio poll
    // their backends continuously, every poll is a proxied request, and counting those is what
    // made an open tab immortal.
    const recordProxiedRequest = (username, sessionId) => {
        if (!isUnobservable(username, sessionId)) {
            return false
        }
        log.debug(() => `Proxied request counted as interaction for ${username} (session ${sessionId})`
            + ' — the app is declared unobservable')
        return Boolean(recordActivity(username, sessionId))
    }

    const sepalUserHeader = username =>
        JSON.stringify({username, roles: []})

    const workerRequest = async (username, method, path, body) => {
        const response = await fetch(`${baseUrl}${path}`, {
            method,
            headers: {
                'sepal-user': sepalUserHeader(username),
                'Content-Type': 'application/json'
            },
            ...body === undefined ? {} : {body: JSON.stringify(body)}
        })
        if (!response.ok) {
            const error = new Error(`worker ${method} ${path} → ${response.status}`)
            error.statusCode = response.status
            throw error
        }
        const text = await response.text()
        return text ? JSON.parse(text) : null
    }

    // POST /sessions/instance-type/{type} → 201 {id, path, username, status, host}
    const requestSession = (username, instanceType) =>
        workerRequest(username, 'POST', `/sessions/instance-type/${encodeURIComponent(instanceType)}`)

    // POST /sessions/session/{id} → {id, path, username, status, host}
    // interaction: true only when a REAL user interaction was attributed to the session since the
    // last heartbeat — the worker ratchets the deadline on it. Losing one is harmless: the GUI
    // re-reports within a minute.
    const sendHeartbeat = (username, sessionId, interaction = false) =>
        workerRequest(username, 'POST', `/sessions/session/${encodeURIComponent(sessionId)}`,
            interaction ? {interaction: true} : undefined)

    // GET /sessions/active → [{id, host, status, instanceType}]
    const findActiveSessions = username =>
        workerRequest(username, 'GET', '/sessions/active')

    // GET /sessions/app-sessions → [{path, label, sessionId, host, status, instanceType}]
    const findAppSessions = username =>
        workerRequest(username, 'GET', '/sessions/app-sessions')

    // POST /sessions/session/{id}/app {path, label, clientId} → 201 {sessionId, path, label}
    // clientId — the browser ws client owning the app's tab; the worker stores it on the
    // association (and refreshes it when an existing association wins).
    // reassert — the GUI replaying an open tab's association after a ws reconnect. Sent only when
    // set, so the worker's default stays "a real open" for any caller that never heard of it.
    const associateApp = (username, sessionId, path, label, clientId, reassert = false) =>
        workerRequest(username, 'POST', `/sessions/session/${encodeURIComponent(sessionId)}/app`,
            {path, label, ...clientId ? {clientId} : {}, ...reassert ? {reassert: true} : {}})

    // DELETE /sessions/app?path=…&clientId=… → 204 (idempotent); clientId = the REQUESTING
    // client, letting the worker's dissociation event tell the owner apart from the remover.
    const dissociateApp = (username, path, clientId) =>
        workerRequest(username, 'DELETE',
            `/sessions/app?path=${encodeURIComponent(path)}${clientId ? `&clientId=${encodeURIComponent(clientId)}` : ''}`)

    // POST /sessions/session/{id}/server/{endpoint} → 204. Resolves only once the server is
    // listening on the session's instance.
    const startServer = (username, sessionId, endpoint) =>
        workerRequest(username, 'POST',
            `/sessions/session/${encodeURIComponent(sessionId)}/server/${encodeURIComponent(endpoint)}`)

    const entriesFor = username =>
        [...(sessionsByUsername.get(username)?.values() ?? [])]

    const cache = (username, key, {sessionId, host, status, endpoint, appPath}) => {
        const entry = {sessionId, host, status, endpoint, appPath: appPath ?? null, lastSeen: Date.now()}
        let entries = sessionsByUsername.get(username)
        if (!entries) {
            entries = new Map()
            sessionsByUsername.set(username, entries)
        }
        entries.set(key, entry)
        return entry
    }

    const getCached = (username, key) =>
        sessionsByUsername.get(username)?.get(key)

    const dropEntry = (username, key) => {
        const entries = sessionsByUsername.get(username)
        if (entries) {
            entries.delete(key)
            if (entries.size === 0) {
                sessionsByUsername.delete(username)
            }
        }
    }

    const dropSession = (username, sessionId) => {
        pendingActivity.delete(activityKey(username, sessionId))
        unobservableUntil.delete(activityKey(username, sessionId))
        interactionSeen.delete(activityKey(username, sessionId))
        const entries = sessionsByUsername.get(username)
        for (const [key, entry] of [...(entries?.entries() ?? [])]) {
            if (entry.sessionId === sessionId) {
                dropEntry(username, key)
            }
        }
        const kernels = kernelsByUsername.get(username)
        for (const [kernelId, kernelEntry] of [...(kernels?.entries() ?? [])]) {
            if (kernelEntry.sessionId === sessionId) {
                kernels.delete(kernelId)
            }
        }
        if (kernels && kernels.size === 0) {
            kernelsByUsername.delete(username)
        }
        for (const endpoint of Object.keys(PORT_BY_ENDPOINT)) {
            startedServers.delete(`${sessionId}:${endpoint}`)
        }
    }

    // Prefer an ACTIVE session, else the first PENDING one.
    const pickBest = sessions => {
        if (!sessions || sessions.length === 0) {
            return null
        }
        return sessions.find(s => s.status === 'ACTIVE') || sessions[0]
    }

    // Find (cache → worker /sessions/active) a session for the user. Only an ACTIVE entry is trusted
    // from the cache: a STARTING one is re-checked against the worker on every call, so the GUI's 2s
    // status poll flips to STARTED as soon as the session goes ACTIVE instead of waiting for the
    // 30s heartbeat.
    const findSession = async (username, endpoint) => {
        const key = appKey({endpoint})
        const cached = getCached(username, key)
        if (cached && cached.status === 'ACTIVE') {
            return cached
        }
        const session = pickBest(await findActiveSessions(username))
        if (!session) {
            if (cached) {
                // The worker no longer knows the cached STARTING session — it's gone.
                dropEntry(username, key)
            }
            return null
        }
        return cache(username, key, {
            sessionId: session.id, host: session.host, status: session.status,
            endpoint, appPath: null
        })
    }

    // Live association for an app: trusted cache when ACTIVE, else re-checked against the worker.
    const findAppSession = async (username, appPath, endpoint) => {
        const key = appKey({appPath, endpoint})
        const cached = getCached(username, key)
        if (cached && cached.status === 'ACTIVE') {
            return cached
        }
        const appSessions = await findAppSessions(username)
        const match = (appSessions ?? []).find(({path}) => path === appPath)
        if (!match) {
            if (cached) {
                dropEntry(username, key)
            }
            return null
        }
        return cache(username, key, {
            sessionId: match.sessionId,
            host: match.host,
            status: match.status === 'STARTING' ? 'STARTING' : 'ACTIVE',
            endpoint,
            appPath
        })
    }

    // startEndpoint — legacy (no app): reuse a cached/existing session or create one of the default
    // type. Returns {id, status} with the CLIENT status string ('STARTED' | 'STARTING').
    const startEndpoint = async (username, endpoint = DEFAULT_ENDPOINT) => {
        const key = appKey({endpoint})
        const existing = await findSession(username, endpoint)
        if (existing) {
            return {id: existing.sessionId, status: toClientStatus(existing.status)}
        }

        // Serialise creation per user so parallel /start calls don't spawn duplicate sessions.
        let inFlight = createLockByKey.get(username)
        if (!inFlight) {
            inFlight = (async () => {
                // Re-check the cache inside the lock: an awaiter that arrived while we were creating
                // may have already populated it. (Only the cache — a worker /sessions/active lookup
                // already ran above before we took the lock.)
                const found = getCached(username, key)
                if (found) {
                    return found
                }
                log.debug(() => `Requesting sandbox session for ${username} (${endpoint})`)
                const session = await requestSession(username, defaultInstanceType)
                return cache(username, key, {
                    sessionId: session.id, host: session.host, status: session.status,
                    endpoint, appPath: null
                })
            })().finally(() => createLockByKey.delete(username))
            createLockByKey.set(username, inFlight)
        }
        const entry = await inFlight
        // The lock cached the session under whichever endpoint the winning caller passed; ensure this
        // endpoint is cached too (parallel callers may use different endpoints of the same session).
        if (!getCached(username, key)) {
            cache(username, key, {
                sessionId: entry.sessionId, host: entry.host, status: entry.status,
                endpoint, appPath: null
            })
        }
        return {id: entry.sessionId, status: toClientStatus(entry.status)}
    }

    // startApp — per app: a live association wins; else join a chosen session or create a new one.
    // `reused` is set when the worker steered us to a different session than the one explicitly
    // requested (it refuses to move a live association). clientId is stored as the association's owner.
    const ensureServerStarted = async ({username, sessionId, endpoint}) => {
        if (!username || !sessionId || !isEndpoint(endpoint)) {
            return
        }
        const key = `${sessionId}:${endpoint}`
        if (startedServers.has(key)) {
            return
        }
        const pending = startingServers.get(key)
        if (pending) {
            return await pending
        }
        const starting = startServer(username, sessionId, endpoint)
            .then(() => {
                startedServers.add(key)
            })
            .finally(() => startingServers.delete(key))
        startingServers.set(key, starting)
        return await starting
    }

    const startAppInternal = async ({username, endpoint = DEFAULT_ENDPOINT, appPath, appLabel, sessionId, instanceType, clientId, reassert = false}) => {
        if (!appPath) {
            return startEndpoint(username, endpoint) // legacy
        }
        // 1. A live association is permanent — it wins over any requested pick. `reused` flags that an
        // EXPLICIT pick (sessionId or instanceType) was overridden by the association (with an
        // instanceType-only pick, sessionId is undefined, so the inequality always holds — correct: the
        // pick was overridden). A bare re-open never sets it.
        const existing = await findAppSession(username, appPath, endpoint)
        if (existing) {
            if (clientId) {
                // Refresh the association's OWNER even though the session doesn't move: the
                // requester shows the tab now, and a reconnect re-assert must transfer
                // ownership off the old clientId before its pending clientDown sweeps it.
                // Best-effort — a failure must not break what was previously a local hit.
                try {
                    await associateApp(username, existing.sessionId, appPath, appLabel, clientId, reassert)
                } catch (error) {
                    log.warn(`Failed to refresh app ownership for ${username} (${appPath})`, error)
                }
            }
            const hadExplicitPick = Boolean(sessionId || instanceType)
            return {
                id: existing.sessionId,
                status: toClientStatus(existing.status),
                ...hadExplicitPick && existing.sessionId !== sessionId ? {reused: true} : {}
            }
        }
        // adoptAssociation — the worker's associate response is authoritative (a concurrent start, or an
        // association the cache missed, may have won); adopt whatever session it names, resolving
        // host/status from /sessions/active when it differs from the requested pick.
        const adoptAssociation = async (associated, requestedSessionId, fallback) => {
            if (associated.sessionId === requestedSessionId) {
                return {entry: cache(username, appKey({appPath}), fallback), reused: false}
            }
            const active = await findActiveSessions(username)
            const winner = (active ?? []).find(({id}) => id === associated.sessionId)
            const entry = cache(username, appKey({appPath}), {
                sessionId: associated.sessionId,
                host: winner?.host ?? null,
                status: winner?.status === 'STARTING' ? 'STARTING' : 'ACTIVE',
                endpoint, appPath
            })
            return {entry, reused: true}
        }
        // 2. Join a chosen running session.
        if (sessionId) {
            const active = await findActiveSessions(username)
            const session = (active ?? []).find(({id}) => id === sessionId)
            if (!session) {
                const error = new Error(`No open session ${sessionId} for ${username}`)
                error.statusCode = 404
                throw error
            }
            const associated = await associateApp(username, sessionId, appPath, appLabel, clientId, reassert)
            const {entry, reused} = await adoptAssociation(associated, sessionId, {
                sessionId, host: session.host,
                status: session.status === 'STARTING' ? 'STARTING' : 'ACTIVE',
                endpoint, appPath
            })
            return {id: entry.sessionId, status: toClientStatus(entry.status), ...reused ? {reused: true} : {}}
        }
        // 3. Create a new session of the chosen type (default type if omitted).
        const type = instanceType ?? defaultInstanceType
        const lockKey = `${username}:${type}`
        let inFlight = createLockByKey.get(lockKey)
        if (!inFlight) {
            inFlight = (async () => await requestSession(username, type))()
                .finally(() => createLockByKey.delete(lockKey))
            createLockByKey.set(lockKey, inFlight)
        }
        const session = await inFlight
        const associated = await associateApp(username, session.id, appPath, appLabel, clientId)
        const {entry, reused} = await adoptAssociation(associated, session.id, {
            sessionId: session.id, host: session.host, status: session.status,
            endpoint, appPath
        })
        return {id: entry.sessionId, status: toClientStatus(entry.status), ...reused ? {reused: true} : {}}
    }

    // startApp — warm the endpoint's server while the GUI still shows its own spinner, so the
    // iframe opens onto a listening port instead of waiting on the proxy's pre-flight.
    //
    // Best-effort ON PURPOSE. The proxy ensures the same server before it forwards anything, so
    // that is the authoritative gate and a real failure surfaces there as a 502; failing the app
    // open here as well would only add a second, earlier failure path for one condition. A
    // STARTING session has no instance to start a server on yet — the proxy covers that too.
    const startApp = async params => {
        const result = await startAppInternal(params)
        if (result?.status === 'STARTED') {
            const endpoint = params.endpoint ?? DEFAULT_ENDPOINT
            try {
                await ensureServerStarted({username: params.username, sessionId: result.id, endpoint})
            } catch (error) {
                log.warn(`Failed to pre-start sandbox ${endpoint} for ${params.username}`, error)
            }
        }
        return result
    }

    // releaseApp — unbind an app from its session (GUI tab close, or a takeover dissociating
    // another client's binding). The worker deletes the association (the session itself stays
    // open — other apps may run on it) and the cached app entry is dropped, so the next start
    // of this app shows the picker again and may land on a different instance. Idempotent;
    // a worker 404 (no association) is fine. clientId = the REQUESTING client.
    const releaseApp = async ({username, appPath, clientId}) => {
        if (!appPath) {
            return
        }
        try {
            await dissociateApp(username, appPath, clientId)
        } catch (error) {
            if (error.statusCode !== 404) {
                throw error
            }
        }
        dropEntry(username, appKey({appPath}))
    }

    // onAppDissociated — workerSession.SessionAppDissociated teardown: a dissociation NOT
    // initiated through this gateway instance (clientDown sweep, another browser's takeover)
    // must still invalidate the cached app entry, or routing and the next start would
    // resurrect the old binding.
    const onAppDissociated = ({username, appPath} = {}) => {
        if (username && appPath) {
            dropEntry(username, appKey({appPath}))
        }
    }

    const status = async (username, endpoint = DEFAULT_ENDPOINT, appPath = null) => {
        const session = appPath
            ? await findAppSession(username, appPath, endpoint)
            : await findSession(username, endpoint)
        return session ? {id: session.sessionId, status: toClientStatus(session.status)} : null
    }

    // jupyter kernel id in a request path (real ids are UUIDs; [\w-]+ covers those and any token).
    const KERNEL_PATH = /\/api\/kernels\/([\w-]+)/

    const stripApi = pathname => pathname.replace(/^\/api/, '')

    const isPrefixOnSegment = (prefix, path) =>
        path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`)

    const attributeByPath = async (username, endpoint, path) => {
        // longest appPath prefix wins; refresh from worker on a cache miss.
        const match = list => list
            .filter(({appPath}) => appPath && isPrefixOnSegment(appPath, path))
            .sort((a, b) => b.appPath.length - a.appPath.length)[0]
        const cachedMatch = match(entriesFor(username))
        if (cachedMatch) {
            return cachedMatch
        }
        const appSessions = await findAppSessions(username).catch(() => null)
        for (const appSession of appSessions ?? []) {
            // Derive each entry's endpoint from its OWN path (/sandbox/<endpoint>/...), NOT the
            // requesting endpoint — otherwise a cross-endpoint app is mislabeled and poisons the
            // single-candidate fallback (d), whose `entry.endpoint === endpoint` filter would then
            // count it as a candidate for the wrong endpoint.
            const pathEndpoint = (appSession.path?.match(/^\/sandbox\/([^/]+)/) || [])[1] ?? endpoint
            cache(username, appSession.path, {
                sessionId: appSession.sessionId, host: appSession.host,
                status: appSession.status === 'STARTING' ? 'STARTING' : 'ACTIVE',
                endpoint: pathEndpoint, appPath: appSession.path
            })
        }
        return match(entriesFor(username)) ?? null
    }

    const probeKernel = async (username, endpoint, kernelId) => {
        const known = kernelsByUsername.get(username)?.get(kernelId)
        if (known) {
            return known
        }
        const candidates = [...new Map(entriesFor(username)
            .filter(({host}) => host)
            .map(entry => [entry.host, entry])).values()]
        for (const candidate of candidates) {
            try {
                const response = await fetch(
                    `http://${candidate.host}:${PORT_BY_ENDPOINT[endpoint]}/api/sandbox/jupyter/api/kernels/${encodeURIComponent(kernelId)}`)
                if (response.ok) {
                    const entry = {sessionId: candidate.sessionId, host: candidate.host}
                    const map = kernelsByUsername.get(username) ?? new Map()
                    map.set(kernelId, entry)
                    kernelsByUsername.set(username, map)
                    return entry
                }
            } catch (_error) {
                // unreachable candidate — try the next one
            }
        }
        return null
    }

    const resolveTarget = async (username, endpoint, pathname = '', referer = null) => {
        if (!isEndpoint(endpoint)) {
            return null
        }
        const port = PORT_BY_ENDPOINT[endpoint]
        const path = stripApi(pathname)
        // (a) kernel-id map / probe (jupyter kernel + channels traffic carries no app path).
        const kernelMatch = pathname.match(KERNEL_PATH)
        if (kernelMatch && endpoint === 'jupyter') {
            const kernelTarget = await probeKernel(username, endpoint, kernelMatch[1])
            if (kernelTarget) {
                recordProxiedRequest(username, kernelTarget.sessionId)
                return {host: kernelTarget.host, port, sessionId: kernelTarget.sessionId}
            }
        }
        // (b) app-path prefix.
        const byPath = await attributeByPath(username, endpoint, path)
        if (byPath?.host) {
            recordProxiedRequest(username, byPath.sessionId)
            return {host: byPath.host, port, sessionId: byPath.sessionId}
        }
        // (c) Referer attribution.
        if (referer) {
            try {
                const refererPath = stripApi(new URL(referer).pathname)
                const byReferer = await attributeByPath(username, endpoint, refererPath)
                if (byReferer?.host) {
                    recordProxiedRequest(username, byReferer.sessionId)
                    return {host: byReferer.host, port, sessionId: byReferer.sessionId}
                }
            } catch (_error) {
                // unparseable referer — ignore
            }
        }
        // (d) single candidate among this endpoint's entries.
        const candidates = entriesFor(username)
            .filter(entry => entry.endpoint === endpoint && entry.host)
        const hosts = [...new Set(candidates.map(({host}) => host))]
        if (hosts.length === 1) {
            candidates.forEach(({sessionId}) => recordProxiedRequest(username, sessionId))
            return {host: hosts[0], port, sessionId: candidates[0].sessionId}
        }
        // (e) legacy per-endpoint entry (best-effort; a failing fallback yields no target).
        try {
            const legacy = await findSession(username, endpoint)
            if (legacy?.host) {
                recordProxiedRequest(username, legacy.sessionId)
                return {host: legacy.host, port, sessionId: legacy.sessionId}
            }
            return null
        } catch (_error) {
            return null
        }
    }

    let heartbeatTimer = null

    const heartbeatOnce = async () => {
        const seen = new Set()
        const targets = []
        for (const [username, entries] of sessionsByUsername.entries()) {
            for (const entry of entries.values()) {
                const key = `${username} ${entry.sessionId}`
                if (!seen.has(key)) {
                    seen.add(key)
                    targets.push({username, sessionId: entry.sessionId})
                }
            }
        }
        for (const {username, sessionId} of targets) {
            try {
                // Consume the interaction marker before sending: a failed heartbeat loses it,
                // which is harmless (the GUI re-reports within a minute).
                const interaction = pendingActivity.delete(activityKey(username, sessionId))
                if (interaction) {
                    log.debug(() => `Heartbeat carrying an interaction for ${username} (session ${sessionId})`)
                }
                const session = await sendHeartbeat(username, sessionId, interaction)
                const entries = sessionsByUsername.get(username)
                if (entries) {
                    for (const entry of entries.values()) {
                        if (entry.sessionId === sessionId) {
                            entry.status = session.status
                            entry.host = session.host
                            entry.lastSeen = Date.now()
                        }
                    }
                }
            } catch (error) {
                if (error.statusCode === 404) {
                    log.debug(() => `Session ${sessionId} closed (worker 404); dropping cache for ${username}`)
                    dropSession(username, sessionId)
                } else {
                    log.warn(`Failed to send heartbeat for session ${sessionId} (${username})`, error)
                }
            }
        }
    }

    // Remove the cached entries for a closed session. Accepts {username, sessionId} (the event
    // payload) or {host} (defensive host match).
    const onSessionClosed = ({username, sessionId, host} = {}) => {
        if (username && sessionId) {
            dropSession(username, sessionId)
            return
        }
        // Fallback: no username — scan every user for a matching sessionId or host.
        for (const [user, entries] of [...sessionsByUsername.entries()]) {
            for (const [key, entry] of [...entries.entries()]) {
                if ((sessionId && entry.sessionId === sessionId) || (host && entry.host === host)) {
                    dropEntry(user, key)
                }
            }
        }
    }

    const start = () => {
        if (!heartbeatTimer) {
            heartbeatTimer = setInterval(() => {
                heartbeatOnce().catch(error => log.error('Heartbeat loop error', error))
            }, heartbeatIntervalMs)
            if (heartbeatTimer.unref) {
                heartbeatTimer.unref()
            }
            log.info(`Sandbox session heartbeat started (every ${heartbeatIntervalMs}ms)`)
        }
    }

    const stop = () => {
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer)
            heartbeatTimer = null
        }
    }

    return {
        startApp,
        releaseApp,
        startEndpoint,
        status,
        resolveTarget,
        ensureServerStarted,
        recordInteraction,
        onSessionClosed,
        onAppDissociated,
        heartbeatOnce,
        start,
        stop,
        _cache: sessionsByUsername,
        _pendingActivity: pendingActivity,
        _unobservableUntil: unobservableUntil,
        PORT_BY_ENDPOINT,
        DEFAULT_ENDPOINT
    }
}

export {createSandboxSessionManager, DEFAULT_ENDPOINT, PORT_BY_ENDPOINT, toClientStatus}

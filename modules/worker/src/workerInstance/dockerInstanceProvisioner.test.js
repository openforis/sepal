import {jest} from '@jest/globals'

// Mock node:fs so tempDir and pubKeyPath reads don't touch the real filesystem.
const mockMkdirSync = jest.fn()
const mockChmodSync = jest.fn()
const mockReadFileSync = jest.fn(() => 'ssh-rsa AAAAB3NzaC1yc2E test-key\n')

jest.unstable_mockModule('node:fs', () => ({
    default: {
        mkdirSync: mockMkdirSync,
        chmodSync: mockChmodSync,
        readFileSync: mockReadFileSync,
    },
    mkdirSync: mockMkdirSync,
    chmodSync: mockChmodSync,
    readFileSync: mockReadFileSync,
}))

// Import the modules AFTER mocking (ESM: dynamic import after jest.unstable_mockModule).
const {createDockerInstanceProvisioner} = await import('./dockerInstanceProvisioner.js')
const {createApiKeyRetryWrapper, NULL_API_KEY_IMPL} = await import('./sandboxSessionApiKey.js')
const {tempDir} = await import('./workerTypes.js')

const CONFIG = {
    sepalVersion: '5.1.0',
    sepalHost: 'sepal.example.com',
    sepalHttpsPort: 443,
    sepalPassword: 'secret',
    sepalHostDataDir: '/data',
    sepalHostProjectDir: '/project',
    dockerPort: 2375,
    dockerEntryPoint: 'v1.38',
    dockerRegistryHost: 'registry.example.com',
    googleProjectId: 'my-gcp-project',
    googleRegion: 'europe-west1',
    googleEarthEngineAccount: 'ee@example.iam.gserviceaccount.com',
    googleEarthEnginePrivateKey: 'private-key-pem',
    deployEnvironment: 'PRODUCTION',
    syslogAddress: null,
}

const CONFIG_WITH_SYSLOG = {
    ...CONFIG,
    syslogAddress: 'udp://syslog.example.com:514',
}

const INSTANCE_TYPE_T3A = {
    id: 'T3aSmall',
    name: 't3a.small',
    cpuCount: 1,
    ramGiB: 2,
    hourlyCost: 0.0204,
    devices: [],
    get ramBytes() { return this.ramGiB * Math.pow(2, 30) },
}

const INSTANCE_TYPE_GPU = {
    id: 'G5Xlarge',
    name: 'g5.xlarge',
    cpuCount: 4,
    ramGiB: 16,
    hourlyCost: 1.123,
    devices: ['/dev/nvidia0', '/dev/nvidiactl'],
    get ramBytes() { return this.ramGiB * Math.pow(2, 30) },
}

const INSTANCE_TYPES = [INSTANCE_TYPE_T3A, INSTANCE_TYPE_GPU]

const makeInstance = (overrides = {}) => ({
    id: 'inst-abc123',
    type: 'T3aSmall',
    host: '10.0.0.1',
    running: true,
    launchTime: new Date(),
    reservation: {username: 'alice', workerType: 'sandbox', sessionId: 'sess-1'},
    ...overrides,
})

const setupFetchMock = ({captureCreate} = {}) => {
    globalThis.fetch = jest.fn(async (url, opts) => {
        if (captureCreate && url.includes('/containers/create')) {
            captureCreate(JSON.parse(opts.body))
        }
        if (url.includes('/containers/json')) {
            return {ok: true, status: 200, text: async () => '[]'}
        }
        if (url.includes('/containers/create')) {
            return {ok: true, status: 201, text: async () => JSON.stringify({Id: 'c-123', Warnings: []})}
        }
        if (url.includes('/exec') && opts?.method === 'POST' && !url.includes('/start')) {
            return {ok: true, status: 201, text: async () => JSON.stringify({Id: 'exec-1'})}
        }
        return {ok: true, status: 200, text: async () => '{}'}
    })
}

describe('buildContainerBody — SANDBOX', () => {
    let capturedBody

    beforeEach(() => {
        mockReadFileSync.mockReturnValue('ssh-rsa AAAAB3NzaC1yc2E test-key\n')
        mockMkdirSync.mockReturnValue(undefined)
        mockChmodSync.mockReturnValue(undefined)
        setupFetchMock({captureCreate: body => { capturedBody = body }})
    })

    const runProvision = (cfg = CONFIG) => {
        const provisioner = createDockerInstanceProvisioner({
            config: cfg,
            instanceTypes: INSTANCE_TYPES,
            sandboxSessionApiKey: NULL_API_KEY_IMPL,
        })
        return provisioner.provisionInstance(makeInstance())
    }

    test('Image field uses registry/openforis/name:version format', async () => {
        await runProvision()
        expect(capturedBody.Image).toBe('registry.example.com/openforis/sandbox:5.1.0')
    })

    test('Tty is true', async () => {
        await runProvision()
        expect(capturedBody.Tty).toBe(true)
    })

    test('Cmd matches sandbox runCommand', async () => {
        await runProvision()
        expect(capturedBody.Cmd).toEqual(['/script/init_container.sh'])
    })

    test('Env contains USER_PUBLIC_KEY', async () => {
        await runProvision()
        expect(capturedBody.Env.some(e => e.startsWith('USER_PUBLIC_KEY='))).toBe(true)
    })

    test('Env contains SEPAL_API_KEY empty when apiKey is null', async () => {
        await runProvision()
        expect(capturedBody.Env).toContain('SEPAL_API_KEY=')
    })

    test('Env contains SEPAL_HOST', async () => {
        await runProvision()
        expect(capturedBody.Env).toContain('SEPAL_HOST=sepal.example.com')
    })

    test('Env contains NVIDIA_VISIBLE_DEVICES=all', async () => {
        await runProvision()
        expect(capturedBody.Env).toContain('NVIDIA_VISIBLE_DEVICES=all')
    })

    test('HostConfig.Binds includes userHome mount', async () => {
        await runProvision()
        expect(capturedBody.HostConfig.Binds).toContain('/data/sepal/home/alice:/home/sepal-user')
    })

    test('HostConfig.Binds includes /tmp from userTmp', async () => {
        await runProvision()
        expect(capturedBody.HostConfig.Binds.some(b => b.endsWith(':/tmp'))).toBe(true)
    })

    test('HostConfig.Tmpfs has /ram entry with size', async () => {
        await runProvision()
        expect(capturedBody.HostConfig.Tmpfs).toHaveProperty('/ram')
        expect(capturedBody.HostConfig.Tmpfs['/ram']).toMatch(/^rw,exec,nosuid,size=\d+$/)
    })

    test('HostConfig.ShmSize is a number (half of ramBytes)', async () => {
        await runProvision()
        const expectedShmSize = Math.floor(INSTANCE_TYPE_T3A.ramBytes / 2)
        expect(capturedBody.HostConfig.ShmSize).toBe(expectedShmSize)
    })

    test('HostConfig.Devices is empty for non-GPU instance type', async () => {
        await runProvision()
        expect(capturedBody.HostConfig.Devices).toEqual([])
    })

    test('HostConfig.Devices includes GPU devices for GPU instance type', async () => {
        const provisioner = createDockerInstanceProvisioner({
            config: CONFIG,
            instanceTypes: INSTANCE_TYPES,
            sandboxSessionApiKey: NULL_API_KEY_IMPL,
        })
        await provisioner.provisionInstance(makeInstance({type: 'G5Xlarge'}))
        expect(capturedBody.HostConfig.Devices).toEqual([
            {PathOnHost: '/dev/nvidia0', PathInContainer: '/dev/nvidia0', CgroupPermissions: 'mrw'},
            {PathOnHost: '/dev/nvidiactl', PathInContainer: '/dev/nvidiactl', CgroupPermissions: 'mrw'},
        ])
    })

    test('HostConfig.LogConfig is null when syslogAddress not set', async () => {
        await runProvision()
        expect(capturedBody.HostConfig.LogConfig).toBeNull()
    })

    test('HostConfig.LogConfig has syslog type when syslogAddress is set', async () => {
        await runProvision(CONFIG_WITH_SYSLOG)
        expect(capturedBody.HostConfig.LogConfig).toMatchObject({
            Type: 'syslog',
            Config: {
                'syslog-address': 'udp://syslog.example.com:514',
                'tag': 'worker-docker/{{.Name}}',
            },
        })
    })

    test('ExposedPorts contains all sandbox ports', async () => {
        await runProvision()
        expect(capturedBody.ExposedPorts).toMatchObject({
            '22/tcp': {},
            '8787/tcp': {},
            '3838/tcp': {},
            '8888/tcp': {},
        })
    })

    test('HostConfig.PortBindings maps exposed to host ports', async () => {
        await runProvision()
        const pb = capturedBody.HostConfig.PortBindings
        expect(pb['22/tcp']).toEqual([{HostPort: '222'}])
        expect(pb['8787/tcp']).toEqual([{HostPort: '8787'}])
        expect(pb['3838/tcp']).toEqual([{HostPort: '3838'}])
        expect(pb['8888/tcp']).toEqual([{HostPort: '8888'}])
    })

    test('NetworkingConfig.EndpointsConfig.sepal exists', async () => {
        await runProvision()
        expect(capturedBody.NetworkingConfig.EndpointsConfig.sepal).toBeDefined()
    })

    test('HostConfig.ExtraHosts defaults to empty array', async () => {
        await runProvision()
        expect(capturedBody.HostConfig.ExtraHosts).toEqual([])
    })

    test('HostConfig.ExtraHosts reflects passed extraHosts', async () => {
        const provisioner = createDockerInstanceProvisioner({
            config: CONFIG,
            instanceTypes: INSTANCE_TYPES,
            sandboxSessionApiKey: NULL_API_KEY_IMPL,
            extraHosts: ['sepal.example.com:host-gateway'],
        })
        await provisioner.provisionInstance(makeInstance())
        expect(capturedBody.HostConfig.ExtraHosts).toEqual(['sepal.example.com:host-gateway'])
    })
})

describe('buildContainerBody — TASK_EXECUTOR', () => {
    let capturedBody

    const taskInstance = makeInstance({reservation: {username: 'alice', workerType: 'task-executor', sessionId: 'sess-1'}})

    beforeEach(() => {
        mockReadFileSync.mockReturnValue('ssh-rsa test')
        mockMkdirSync.mockReturnValue(undefined)
        mockChmodSync.mockReturnValue(undefined)
        setupFetchMock({captureCreate: body => { capturedBody = body }})
    })

    const runProvision = (cfg = CONFIG) => {
        const provisioner = createDockerInstanceProvisioner({
            config: cfg,
            instanceTypes: INSTANCE_TYPES,
            sandboxSessionApiKey: NULL_API_KEY_IMPL,
        })
        return provisioner.provisionInstance(taskInstance)
    }

    test('Image field uses task image name', async () => {
        await runProvision()
        expect(capturedBody.Image).toBe('registry.example.com/openforis/task:5.1.0')
    })

    test('Env contains GOOGLE_PROJECT_ID', async () => {
        await runProvision()
        expect(capturedBody.Env).toContain('GOOGLE_PROJECT_ID=my-gcp-project')
    })

    test('Env contains EE_PRIVATE_KEY with line breaks replaced', async () => {
        const cfg = {...CONFIG, googleEarthEnginePrivateKey: 'line1\nline2\nline3'}
        await runProvision(cfg)
        expect(capturedBody.Env).toContain('EE_PRIVATE_KEY=line1-----LINE BREAK-----line2-----LINE BREAK-----line3')
    })

    test('Env contains SEPAL_ENDPOINT', async () => {
        await runProvision()
        expect(capturedBody.Env).toContain('SEPAL_ENDPOINT=https://sepal.example.com:443')
    })

    test('Env contains NODE_TLS_REJECT_UNAUTHORIZED=1 in PRODUCTION', async () => {
        await runProvision()
        expect(capturedBody.Env).toContain('NODE_TLS_REJECT_UNAUTHORIZED=1')
    })

    test('ExposedPorts contains 80', async () => {
        await runProvision()
        expect(capturedBody.ExposedPorts).toMatchObject({'80/tcp': {}})
    })

    test('HostConfig.PortBindings maps 80 → 8080', async () => {
        await runProvision()
        expect(capturedBody.HostConfig.PortBindings['80/tcp']).toEqual([{HostPort: '8080'}])
    })

    test('DEV mode adds hot-reload volume mounts', async () => {
        const cfg = {...CONFIG, deployEnvironment: 'DEV', sepalHostProjectDir: '/project'}
        await runProvision(cfg)
        const binds = capturedBody.HostConfig.Binds
        expect(binds.some(b => b.includes('/modules/task/src'))).toBe(true)
        expect(binds.some(b => b.includes('/lib/js/shared/src'))).toBe(true)
    })
})

describe('provisionInstance sequence', () => {
    const calls = []

    beforeEach(() => {
        calls.length = 0
        mockReadFileSync.mockReturnValue('ssh-rsa test')
        mockMkdirSync.mockReturnValue(undefined)
        mockChmodSync.mockReturnValue(undefined)

        globalThis.fetch = jest.fn(async (url, opts) => {
            calls.push({url, method: opts?.method ?? 'GET'})
            if (url.includes('/containers/json')) {
                return {ok: true, status: 200, text: async () => '[]'}
            }
            if (url.includes('/containers/create')) {
                return {ok: true, status: 201, text: async () => JSON.stringify({Id: 'c-123', Warnings: []})}
            }
            if (url.includes('/exec') && !url.includes('/start')) {
                return {ok: true, status: 201, text: async () => JSON.stringify({Id: 'exec-123'})}
            }
            return {ok: true, status: 200, text: async () => '{}'}
        })
    })

    test('calls docker endpoints in expected order', async () => {
        const provisioner = createDockerInstanceProvisioner({
            config: CONFIG,
            instanceTypes: INSTANCE_TYPES,
            sandboxSessionApiKey: NULL_API_KEY_IMPL,
        })
        await provisioner.provisionInstance(makeInstance())
        const paths = calls.map(c => `${c.method} ${new URL(c.url).pathname}`)
        expect(paths[0]).toMatch(/GET.*containers\/json/)
        expect(paths[1]).toMatch(/GET.*containers\/json/)
        expect(paths[2]).toMatch(/POST.*containers\/create/)
        expect(paths[3]).toMatch(/POST.*containers.*\/start/)
        expect(paths[4]).toMatch(/POST.*exec/)
        expect(paths[5]).toMatch(/POST.*exec.*\/start/)
    })
})

describe('provisionInstance deletes .worker containers only', () => {
    beforeEach(() => {
        mockReadFileSync.mockReturnValue('ssh-rsa test')
        mockMkdirSync.mockReturnValue(undefined)
        mockChmodSync.mockReturnValue(undefined)
    })

    test('deletes .worker container but not other containers', async () => {
        const deletedIds = []

        globalThis.fetch = jest.fn(async (url, opts) => {
            const method = opts?.method ?? 'GET'
            if (url.includes('/containers/json')) {
                return {
                    ok: true, status: 200,
                    text: async () => JSON.stringify([
                        {Id: 'worker-id-1', Names: ['/alice.sandbox.worker']},
                        {Id: 'other-id-1', Names: ['/some-other-container']},
                    ]),
                }
            }
            if (method === 'DELETE') {
                const match = url.match(/\/containers\/([^?]+)/)
                if (match) deletedIds.push(match[1])
                return {ok: true, status: 204, text: async () => ''}
            }
            if (url.includes('/exec') && !url.includes('/start')) {
                return {ok: true, status: 201, text: async () => JSON.stringify({Id: 'exec-1'})}
            }
            return {ok: true, status: 200, text: async () => '{}'}
        })

        const provisioner = createDockerInstanceProvisioner({
            config: CONFIG,
            instanceTypes: INSTANCE_TYPES,
            sandboxSessionApiKey: NULL_API_KEY_IMPL,
        })
        await provisioner.provisionInstance(makeInstance())

        expect(deletedIds).toContain('worker-id-1')
        expect(deletedIds).not.toContain('other-id-1')
    })
})

describe('undeploy', () => {
    beforeEach(() => {
        mockReadFileSync.mockReturnValue('ssh-rsa test')
        mockMkdirSync.mockReturnValue(undefined)
        mockChmodSync.mockReturnValue(undefined)
    })

    test('calls GET containers/json then DELETE for .worker containers', async () => {
        const deletedIds = []
        let listCalled = false

        globalThis.fetch = jest.fn(async (url, opts) => {
            const method = opts?.method ?? 'GET'
            if (url.includes('/containers/json')) {
                listCalled = true
                return {
                    ok: true, status: 200,
                    text: async () => JSON.stringify([
                        {Id: 'w-001', Names: ['/bob.task.worker']},
                    ]),
                }
            }
            if (method === 'DELETE') {
                const match = url.match(/\/containers\/([^?]+)/)
                if (match) deletedIds.push(match[1])
                return {ok: true, status: 204, text: async () => ''}
            }
            return {ok: true, status: 200, text: async () => '{}'}
        })

        const provisioner = createDockerInstanceProvisioner({
            config: CONFIG,
            instanceTypes: INSTANCE_TYPES,
            sandboxSessionApiKey: NULL_API_KEY_IMPL,
        })
        await provisioner.undeploy(makeInstance())

        expect(listCalled).toBe(true)
        expect(deletedIds).toEqual(['w-001'])
    })

    test('on the shared daemon, deletes this instance\'s container and leaves another instance\'s', async () => {
        const deletedIds = []

        globalThis.fetch = jest.fn(async (url, opts) => {
            const method = opts?.method ?? 'GET'
            if (url.includes('/containers/json')) {
                return {
                    ok: true, status: 200,
                    text: async () => JSON.stringify([
                        {Id: 'mine', Names: ['/sandbox.alice.lofty-reef.inst-abc123']},
                        {Id: 'theirs', Names: ['/sandbox.bob.misty-fjord.inst-other']},
                    ]),
                }
            }
            if (method === 'DELETE') {
                const match = url.match(/\/containers\/([^?]+)/)
                if (match) deletedIds.push(match[1])
                return {ok: true, status: 204, text: async () => ''}
            }
            return {ok: true, status: 200, text: async () => '{}'}
        })

        const provisioner = createDockerInstanceProvisioner({
            config: CONFIG,
            instanceTypes: INSTANCE_TYPES,
            sandboxSessionApiKey: NULL_API_KEY_IMPL,
            defaultDaemonHost: 'daemon-host',
        })
        await provisioner.undeploy(makeInstance({daemonHost: 'daemon-host'}))

        expect(deletedIds).toEqual(['mine'])
    })

    test('undeploy does nothing when no .worker containers exist', async () => {
        let deleteCallCount = 0

        globalThis.fetch = jest.fn(async (url, opts) => {
            const method = opts?.method ?? 'GET'
            if (url.includes('/containers/json')) {
                return {ok: true, status: 200, text: async () => JSON.stringify([])}
            }
            if (method === 'DELETE') {
                deleteCallCount++
                return {ok: true, status: 204, text: async () => ''}
            }
            return {ok: true, status: 200, text: async () => '{}'}
        })

        const provisioner = createDockerInstanceProvisioner({
            config: CONFIG,
            instanceTypes: INSTANCE_TYPES,
            sandboxSessionApiKey: NULL_API_KEY_IMPL,
        })
        await provisioner.undeploy(makeInstance())

        expect(deleteCallCount).toBe(0)
    })
})

describe('instanceStatus', () => {
    beforeEach(() => {
        mockReadFileSync.mockReturnValue('ssh-rsa test')
        mockMkdirSync.mockReturnValue(undefined)
        mockChmodSync.mockReturnValue(undefined)
    })

    const probe = () => createDockerInstanceProvisioner({
        config: CONFIG,
        instanceTypes: INSTANCE_TYPES,
        sandboxSessionApiKey: NULL_API_KEY_IMPL,
    }).instanceStatus(makeInstance())

    const inspectResponds = body => {
        globalThis.fetch = jest.fn(async () => ({ok: true, status: 200, text: async () => JSON.stringify(body)}))
    }

    test('PROVISIONED when the container is running', async () => {
        inspectResponds({State: {Running: true}})
        expect(await probe()).toBe('PROVISIONED')
    })

    test('MISSING when Docker says there is no such container', async () => {
        globalThis.fetch = jest.fn(async () => ({ok: false, status: 404, text: async () => 'No such container'}))
        expect(await probe()).toBe('MISSING')
    })

    test('MISSING when the container exists but is not running', async () => {
        inspectResponds({State: {Running: false}})
        expect(await probe()).toBe('MISSING')
    })

    // The bug this probe exists to fix: a transient blip must never read as "the instance is gone".
    test('UNKNOWN when the daemon is unreachable', async () => {
        globalThis.fetch = jest.fn(async () => {throw new Error('ECONNREFUSED')})
        expect(await probe()).toBe('UNKNOWN')
    })

    test('UNKNOWN when the daemon answers 5xx', async () => {
        globalThis.fetch = jest.fn(async () => ({ok: false, status: 503, text: async () => 'unavailable'}))
        expect(await probe()).toBe('UNKNOWN')
    })

    test('UNKNOWN when the probe times out', async () => {
        globalThis.fetch = jest.fn(async () => {
            const error = new Error('The operation was aborted due to timeout')
            error.name = 'TimeoutError'
            throw error
        })
        expect(await probe()).toBe('UNKNOWN')
    })

    test('inspects the container instead of running an exec in it', async () => {
        inspectResponds({State: {Running: true}})
        await probe()
        const urls = globalThis.fetch.mock.calls.map(([url]) => url)
        expect(urls.some(url => url.includes('/exec'))).toBe(false)
        expect(urls.every(url => /\/containers\/[^/]+\/json$/.test(url))).toBe(true)
    })

    test('is bounded by a timeout so an unreachable host cannot stall the sweep', async () => {
        inspectResponds({State: {Running: true}})
        await probe()
        const [, init] = globalThis.fetch.mock.calls[0]
        expect(init.signal).toBeInstanceOf(AbortSignal)
    })
})

describe('apiKey retry', () => {
    beforeEach(() => {
        mockReadFileSync.mockReturnValue('ssh-rsa test')
        mockMkdirSync.mockReturnValue(undefined)
        mockChmodSync.mockReturnValue(undefined)
    })

    test('apiKey is passed to SANDBOX Env when non-null', async () => {
        let capturedEnv = null
        setupFetchMock({captureCreate: body => { capturedEnv = body.Env }})

        let callCount = 0
        const mockApiKeyImpl = {
            apiKeyForInstance: jest.fn(async () => {
                callCount++
                if (callCount < 5) return null
                return 'my-api-key'
            })
        }
        const retryWrapper = createApiKeyRetryWrapper(mockApiKeyImpl, {retries: 5, delayMs: 0})

        const provisioner = createDockerInstanceProvisioner({
            config: CONFIG,
            instanceTypes: INSTANCE_TYPES,
            sandboxSessionApiKey: retryWrapper,
        })
        await provisioner.provisionInstance(makeInstance())

        expect(capturedEnv).toContain('SEPAL_API_KEY=my-api-key')
        expect(mockApiKeyImpl.apiKeyForInstance).toHaveBeenCalledTimes(5)
    })

    test('SEPAL_API_KEY is empty string when all retries return null', async () => {
        let capturedEnv = null
        setupFetchMock({captureCreate: body => { capturedEnv = body.Env }})

        const provisioner = createDockerInstanceProvisioner({
            config: CONFIG,
            instanceTypes: INSTANCE_TYPES,
            sandboxSessionApiKey: NULL_API_KEY_IMPL,
        })
        await provisioner.provisionInstance(makeInstance())

        expect(capturedEnv).toContain('SEPAL_API_KEY=')
    })
})

describe('tempDir', () => {
    beforeEach(() => {
        mockMkdirSync.mockReset()
        mockChmodSync.mockReset()
    })

    test('calls mkdirSync with /data/home/{username}/tmp/{instanceId} and recursive:true', () => {
        const instance = {id: 'inst-123', reservation: {username: 'alice'}}
        const config = {sepalHostDataDir: '/data'}
        tempDir(instance, config)
        expect(mockMkdirSync).toHaveBeenCalledWith('/data/home/alice/tmp/inst-123', {recursive: true})
    })

    test('calls chmodSync with localTmp and 0o1777', () => {
        const instance = {id: 'inst-123', reservation: {username: 'alice'}}
        const config = {sepalHostDataDir: '/data'}
        tempDir(instance, config)
        expect(mockChmodSync).toHaveBeenCalledWith('/data/home/alice/tmp/inst-123', 0o1777)
    })

    test('returns {sepalHostDataDir}/sepal/home/{username}/tmp/{instanceId}', () => {
        const instance = {id: 'inst-123', reservation: {username: 'alice'}}
        const config = {sepalHostDataDir: '/host-data'}
        const result = tempDir(instance, config)
        expect(result).toBe('/host-data/sepal/home/alice/tmp/inst-123')
    })

    test('localTmp is always under /data/home (hardcoded prefix, not sepalHostDataDir)', () => {
        const instance = {id: 'i-999', reservation: {username: 'bob'}}
        const config = {sepalHostDataDir: '/some/other/path'}
        tempDir(instance, config)
        expect(mockMkdirSync).toHaveBeenCalledWith('/data/home/bob/tmp/i-999', {recursive: true})
    })
})

describe('createApiKeyRetryWrapper', () => {
    test('returns null when impl always returns null (all retries exhausted)', async () => {
        const impl = {apiKeyForInstance: jest.fn(async () => null)}
        const wrapper = createApiKeyRetryWrapper(impl, {retries: 5, delayMs: 0})
        const result = await wrapper.apiKeyForInstance('i-001')
        expect(result).toBeNull()
        expect(impl.apiKeyForInstance).toHaveBeenCalledTimes(5)
    })

    test('returns value on 3rd attempt when first 2 return null', async () => {
        let count = 0
        const impl = {
            apiKeyForInstance: jest.fn(async () => {
                count++
                return count < 3 ? null : 'api-key-value'
            })
        }
        const wrapper = createApiKeyRetryWrapper(impl, {retries: 5, delayMs: 0})
        const result = await wrapper.apiKeyForInstance('i-002')
        expect(result).toBe('api-key-value')
        expect(impl.apiKeyForInstance).toHaveBeenCalledTimes(3)
    })

    test('returns value on first attempt when immediately available', async () => {
        const impl = {apiKeyForInstance: jest.fn(async () => 'immediate-key')}
        const wrapper = createApiKeyRetryWrapper(impl, {retries: 5, delayMs: 0})
        const result = await wrapper.apiKeyForInstance('i-003')
        expect(result).toBe('immediate-key')
        expect(impl.apiKeyForInstance).toHaveBeenCalledTimes(1)
    })

    // Uses the injected _sleep seam rather than jest fake timers: under Jest's ESM mode
    // useRealTimers() DELETES globalThis.setTimeout instead of restoring it, so every later test
    // in this file that sleeps died with `ReferenceError: setTimeout is not defined`.
    test('sleeps delayMs between retries, and not after the successful attempt', async () => {
        const slept = []
        let count = 0
        const impl = {
            apiKeyForInstance: jest.fn(async () => {
                count++
                return count < 3 ? null : 'key'
            })
        }
        const wrapper = createApiKeyRetryWrapper(impl, {
            retries: 5,
            delayMs: 50,
            _sleep: async ms => { slept.push(ms) },
        })
        const result = await wrapper.apiKeyForInstance('i-004')
        expect(result).toBe('key')
        expect(impl.apiKeyForInstance).toHaveBeenCalledTimes(3)
        // Two failed attempts → two sleeps; the third succeeds and returns without sleeping.
        expect(slept).toEqual([50, 50])
    })

    test('NULL_API_KEY_IMPL always returns null', async () => {
        const result = await NULL_API_KEY_IMPL.apiKeyForInstance('any-id')
        expect(result).toBeNull()
    })
})

describe('waitUntilDockerIsAvailable', () => {
    beforeEach(() => {
        mockReadFileSync.mockReturnValue('ssh-rsa test')
        mockMkdirSync.mockReturnValue(undefined)
        mockChmodSync.mockReturnValue(undefined)
    })

    test('succeeds after transient errors then success', async () => {
        let callCount = 0
        globalThis.fetch = jest.fn(async (url, opts) => {
            if (url.includes('/containers/json')) {
                callCount++
                if (callCount < 3) throw new Error('ECONNREFUSED')
                return {ok: true, status: 200, text: async () => '[]'}
            }
            if (url.includes('/exec') && opts?.method === 'POST' && !url.includes('/start')) {
                return {ok: true, status: 201, text: async () => JSON.stringify({Id: 'exec-1'})}
            }
            return {ok: true, status: 200, text: async () => '{}'}
        })

        const provisioner = createDockerInstanceProvisioner({
            config: CONFIG,
            instanceTypes: INSTANCE_TYPES,
            sandboxSessionApiKey: NULL_API_KEY_IMPL,
        })
        await expect(provisioner.provisionInstance(makeInstance())).resolves.toBeUndefined()
    })
})

// Tests for removeOrphanedContainers — the shared-local-daemon sweep that deletes worker
// containers no longer claimed by any live instance. Drives the provisioner through a mocked
// global fetch (no real Docker daemon).
const ORPHAN_CONFIG = {
    dockerPort: 2375,
    dockerEntryPoint: 'v1.41',
    dockerRegistryHost: 'registry',
    sepalVersion: 'test',
    syslogAddress: null,
}

const NOW_S = Math.floor(Date.now() / 1000)
const OLD = NOW_S - 3600      // well past the grace period
const YOUNG = NOW_S - 60      // within the grace period

// makeFetch — GET containers/json returns `containers`; every other call records + succeeds.
const makeFetch = containers => {
    const requests = []
    const fetch = jest.fn(async (url, init = {}) => {
        requests.push({url, method: init.method ?? 'GET'})
        const body = url.includes('containers/json') ? JSON.stringify(containers) : ''
        return {ok: true, status: 200, text: async () => body}
    })
    return {fetch, requests}
}

const makeProvisioner = ({defaultDaemonHost = 'daemon-host'} = {}) =>
    createDockerInstanceProvisioner({
        config: ORPHAN_CONFIG,
        instanceTypes: [],
        sandboxSessionApiKey: {apiKeyForInstance: async () => null},
        defaultDaemonHost,
    })

const deletedContainerIds = requests => requests
    .filter(({method}) => method === 'DELETE')
    .map(({url}) => url.match(/containers\/([^/?]+)/)[1])

describe('removeOrphanedContainers', () => {
    afterEach(() => {
        delete global.fetch
    })

    it('deletes worker containers that match no live instance', async () => {
        const {fetch, requests} = makeFetch([
            {Id: 'c-orphan', Names: ['/sandbox.admin.bbb'], Created: OLD},
        ])
        global.fetch = fetch

        const removed = await makeProvisioner().removeOrphanedContainers(['aaa'])

        expect(deletedContainerIds(requests)).toEqual(['c-orphan'])
        expect(removed).toEqual(['/sandbox.admin.bbb'])
    })

    it('keeps containers whose name suffix matches a live instance', async () => {
        const {fetch, requests} = makeFetch([
            {Id: 'c-live', Names: ['/sandbox.admin.aaa'], Created: OLD},
            {Id: 'c-task-live', Names: ['/task.admin.aaa'], Created: OLD},
        ])
        global.fetch = fetch

        const removed = await makeProvisioner().removeOrphanedContainers(['aaa'])

        expect(deletedContainerIds(requests)).toEqual([])
        expect(removed).toEqual([])
    })

    it('keeps a current-format container whose name ends with a live instance id', async () => {
        const {fetch, requests} = makeFetch([
            {Id: 'c-live', Names: ['/sandbox.admin.lofty-reef.aaa'], Created: OLD},
        ])
        global.fetch = fetch

        const removed = await makeProvisioner().removeOrphanedContainers(['aaa'])

        expect(deletedContainerIds(requests)).toEqual([])
        expect(removed).toEqual([])
    })

    it('keeps AWS-style live instance ids', async () => {
        const {fetch, requests} = makeFetch([
            {Id: 'c-live', Names: ['/sandbox.admin.i-0abc123'], Created: OLD},
        ])
        global.fetch = fetch

        await makeProvisioner().removeOrphanedContainers(['i-0abc123'])

        expect(deletedContainerIds(requests)).toEqual([])
    })

    it('keeps legacy-named containers that carry a live instance id elsewhere in the name', async () => {
        const {fetch, requests} = makeFetch([
            {Id: 'c-legacy', Names: ['/aaa.sandbox.worker'], Created: OLD},
        ])
        global.fetch = fetch

        await makeProvisioner().removeOrphanedContainers(['aaa'])

        expect(deletedContainerIds(requests)).toEqual([])
    })

    it('keeps containers younger than the grace period', async () => {
        const {fetch, requests} = makeFetch([
            {Id: 'c-fresh', Names: ['/sandbox.admin.bbb'], Created: YOUNG},
        ])
        global.fetch = fetch

        await makeProvisioner().removeOrphanedContainers(['aaa'])

        expect(deletedContainerIds(requests)).toEqual([])
    })

    it('ignores non-worker containers', async () => {
        const {fetch, requests} = makeFetch([
            {Id: 'c-mysql', Names: ['/mysql'], Created: OLD},
        ])
        global.fetch = fetch

        await makeProvisioner().removeOrphanedContainers([])

        expect(deletedContainerIds(requests)).toEqual([])
    })

    it('is a no-op without a defaultDaemonHost (dedicated-host hosting, e.g. AWS)', async () => {
        const {fetch} = makeFetch([])
        global.fetch = fetch

        const removed = await makeProvisioner({defaultDaemonHost: null}).removeOrphanedContainers(['aaa'])

        expect(fetch).not.toHaveBeenCalled()
        expect(removed).toEqual([])
    })
})

import {jest} from '@jest/globals'

// Mock node:fs so pubKeyPath reads don't touch the real filesystem.
const mockReadFileSync = jest.fn(() => 'ssh-rsa AAAAB3NzaC1yc2E test-key\n')

jest.unstable_mockModule('node:fs', () => ({
    default: {
        readFileSync: mockReadFileSync,
    },
    readFileSync: mockReadFileSync,
}))

// Import the modules AFTER mocking (ESM: dynamic import after jest.unstable_mockModule).
const {createDockerInstanceProvisioner} = await import('./dockerInstanceProvisioner.js')
const {createApiKeyRetryWrapper, NULL_API_KEY_IMPL} = await import('./sandboxSessionApiKey.js')
const {instanceName} = await import('../instanceName.js')

// Provisioning refuses without a key, so this stands in for the session lookup wherever the key
// itself is not the subject.
const SESSION_API_KEY = {apiKeyForInstance: async () => 'session-key'}

const CONFIG = {
    workerAmiVersion: '5.1.0',
    sepalHost: 'sepal.example.com',
    sepalHttpsPort: 443,
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
        setupFetchMock({captureCreate: body => { capturedBody = body }})
    })

    const runProvision = (cfg = CONFIG) => {
        const provisioner = createDockerInstanceProvisioner({
            config: cfg,
            instanceTypes: INSTANCE_TYPES,
            sandboxSessionApiKey: SESSION_API_KEY,
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

    test('Env contains the session api key', async () => {
        await runProvision()
        expect(capturedBody.Env).toContain('SEPAL_API_KEY=session-key')
    })

    test('Env contains SEPAL_HOST', async () => {
        await runProvision()
        expect(capturedBody.Env).toContain('SEPAL_HOST=sepal.example.com')
    })

    test('Env contains NVIDIA_VISIBLE_DEVICES=all', async () => {
        await runProvision()
        expect(capturedBody.Env).toContain('NVIDIA_VISIBLE_DEVICES=all')
    })

    test('Env contains CARTODB_BASEMAP_KEY when configured', async () => {
        await runProvision({...CONFIG, cartoDbBasemapKey: 'carto-key'})
        expect(capturedBody.Env).toContain('CARTODB_BASEMAP_KEY=carto-key')
    })

    test('Env contains CARTODB_BASEMAP_KEY empty when unconfigured', async () => {
        await runProvision()
        expect(capturedBody.Env).toContain('CARTODB_BASEMAP_KEY=')
    })

    test('HostConfig.Binds includes userHome mount', async () => {
        await runProvision()
        expect(capturedBody.HostConfig.Binds).toContain('/data/sepal/home/alice:/home/sepal-user')
    })

    test('HostConfig.Binds mounts the instance\'s tmp volume at /tmp and ~/tmp, copying only /tmp', async () => {
        await runProvision()
        expect(capturedBody.HostConfig.Binds).toEqual(expect.arrayContaining([
            'sepal-tmp.inst-abc123:/tmp',
            'sepal-tmp.inst-abc123:/home/sepal-user/tmp:nocopy',
        ]))
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
            sandboxSessionApiKey: SESSION_API_KEY,
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

    // The shell prompt inside the sandbox is "{hostname}:{dir}$", so the hostname is what a user
    // reads to tell one open terminal from another — it has to be the same two-word name every
    // other surface calls this instance, not the container id Docker would otherwise assign.
    test('Hostname is the instance\'s two-word name', async () => {
        await runProvision()
        expect(capturedBody.Hostname).toBe(instanceName('sess-1'))
    })

    test('HostConfig.ExtraHosts defaults to empty array', async () => {
        await runProvision()
        expect(capturedBody.HostConfig.ExtraHosts).toEqual([])
    })

    test('HostConfig.ExtraHosts reflects passed extraHosts', async () => {
        const provisioner = createDockerInstanceProvisioner({
            config: CONFIG,
            instanceTypes: INSTANCE_TYPES,
            sandboxSessionApiKey: SESSION_API_KEY,
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
        setupFetchMock({captureCreate: body => { capturedBody = body }})
    })

    const runProvision = (cfg = CONFIG) => {
        const provisioner = createDockerInstanceProvisioner({
            config: cfg,
            instanceTypes: INSTANCE_TYPES,
            sandboxSessionApiKey: SESSION_API_KEY,
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

    test('Env carries the session api key and no administrator password', async () => {
        await runProvision()
        expect(capturedBody.Env).toContain('SEPAL_API_KEY=session-key')
        expect(capturedBody.Env.some(e => e.startsWith('SEPAL_ADMIN_PASSWORD='))).toBe(false)
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
            sandboxSessionApiKey: SESSION_API_KEY,
        })
        await provisioner.provisionInstance(makeInstance())
        const paths = calls.map(c => `${c.method} ${new URL(c.url).pathname}`)
        expect(paths[0]).toMatch(/GET.*containers\/json/)
        expect(paths[1]).toMatch(/GET.*containers\/json/)
        expect(paths[2]).toMatch(/DELETE.*volumes\/sepal-tmp\.inst-abc123$/)
        expect(paths[3]).toMatch(/POST.*containers\/create/)
        expect(paths[4]).toMatch(/POST.*containers.*\/start/)
        expect(paths[5]).toMatch(/POST.*exec/)
        expect(paths[6]).toMatch(/POST.*exec.*\/start/)
    })
})

describe('provisionInstance on a scratch device', () => {
    const recordingFetch = ({formatExitCode = 0} = {}) => {
        const requests = []
        globalThis.fetch = jest.fn(async (url, opts = {}) => {
            const {pathname, searchParams} = new URL(url)
            requests.push({method: opts.method ?? 'GET', pathname, name: searchParams.get('name'), body: opts.body && JSON.parse(opts.body)})
            if (pathname.endsWith('/containers/json')) {
                return {ok: true, status: 200, text: async () => '[]'}
            }
            if (pathname.endsWith('/wait')) {
                return {ok: true, status: 200, text: async () => JSON.stringify({StatusCode: formatExitCode})}
            }
            if (pathname.endsWith('/logs')) {
                return {ok: true, status: 200, text: async () => 'mkfs.xfs: no such device'}
            }
            if (pathname.includes('/exec') && !pathname.endsWith('/start')) {
                return {ok: true, status: 201, text: async () => JSON.stringify({Id: 'exec-1'})}
            }
            return {ok: true, status: 200, text: async () => '{}'}
        })
        return requests
    }

    const makeProvisioner = () => createDockerInstanceProvisioner({
        config: CONFIG,
        instanceTypes: INSTANCE_TYPES,
        sandboxSessionApiKey: SESSION_API_KEY,
    })

    const formatName = 'sandbox.format-tmp.inst-abc123'

    test('formats the device, then puts the tmp volume on it before creating the container', async () => {
        const requests = recordingFetch()

        await makeProvisioner().provisionInstance(makeInstance(), {tmpDevice: '/dev/xvdg'})

        const format = requests.find(r => r.pathname.endsWith('/containers/create') && r.name === formatName)
        expect(format.body).toMatchObject({
            Image: 'registry.example.com/openforis/sandbox:5.1.0',
            User: 'root',
            HostConfig: {Privileged: true, Binds: ['/:/host']},
        })
        expect(format.body.Entrypoint.slice(0, 2)).toEqual(['chroot', '/host'])
        expect(format.body.Entrypoint.at(-1)).toBe('/dev/xvdg')
        const volume = requests.find(r => r.pathname.endsWith('/volumes/create'))
        expect(volume.body).toEqual({
            Name: 'sepal-tmp.inst-abc123',
            Driver: 'local',
            DriverOpts: {type: 'xfs', device: '/dev/xvdg', o: 'noatime'},
        })
        const steps = requests.map(r => r.pathname.endsWith('/containers/create') ? `create ${r.name}` : `${r.method} ${r.pathname.split('/').slice(-2).join('/')}`)
        expect(steps).toEqual(expect.arrayContaining([`POST ${formatName}/wait`, `DELETE containers/${formatName}`, 'POST volumes/create']))
        expect(steps.indexOf(`POST ${formatName}/wait`)).toBeLessThan(steps.indexOf('POST volumes/create'))
        expect(steps.indexOf(`DELETE containers/${formatName}`)).toBeGreaterThan(steps.indexOf(`POST ${formatName}/wait`))
        expect(steps.indexOf('POST volumes/create')).toBeLessThan(steps.findIndex(step => step.startsWith('create sandbox.alice.')))
    })

    test('fails, removing the format container, when the device cannot be formatted', async () => {
        const requests = recordingFetch({formatExitCode: 1})

        await expect(makeProvisioner().provisionInstance(makeInstance(), {tmpDevice: '/dev/xvdg'}))
            .rejects.toThrow(/Failed to format \/dev\/xvdg \(exit 1\): mkfs.xfs: no such device/)

        expect(requests.some(r => r.method === 'DELETE' && r.pathname.endsWith(`/containers/${formatName}`))).toBe(true)
        expect(requests.some(r => r.pathname.endsWith('/volumes/create'))).toBe(false)
    })

    test('leaves the tmp volume to Docker without a device', async () => {
        const requests = recordingFetch()

        await makeProvisioner().provisionInstance(makeInstance())

        expect(requests.some(r => r.name === formatName)).toBe(false)
        expect(requests.some(r => r.pathname.endsWith('/volumes/create'))).toBe(false)
    })
})

describe('provisionInstance deletes .worker containers only', () => {
    beforeEach(() => {
        mockReadFileSync.mockReturnValue('ssh-rsa test')
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
            sandboxSessionApiKey: SESSION_API_KEY,
        })
        await provisioner.provisionInstance(makeInstance())

        expect(deletedIds).toContain('worker-id-1')
        expect(deletedIds).not.toContain('other-id-1')
    })
})

describe('undeploy', () => {
    beforeEach(() => {
        mockReadFileSync.mockReturnValue('ssh-rsa test')
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
            sandboxSessionApiKey: SESSION_API_KEY,
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
            sandboxSessionApiKey: SESSION_API_KEY,
            defaultDaemonHost: 'daemon-host',
        })
        await provisioner.undeploy(makeInstance({daemonHost: 'daemon-host'}))

        expect(deletedIds).toEqual(['mine'])
    })

    test('deletes the instance\'s tmp volume once its containers are gone', async () => {
        const deletions = []

        globalThis.fetch = jest.fn(async (url, opts) => {
            const method = opts?.method ?? 'GET'
            if (url.includes('/containers/json')) {
                return {
                    ok: true, status: 200,
                    text: async () => JSON.stringify([{Id: 'w-001', Names: ['/sandbox.alice.lofty-reef.inst-abc123']}]),
                }
            }
            if (method === 'DELETE') {
                deletions.push(new URL(url).pathname.split('/').slice(-2).join('/'))
            }
            return {ok: true, status: 204, text: async () => ''}
        })

        const provisioner = createDockerInstanceProvisioner({
            config: CONFIG,
            instanceTypes: INSTANCE_TYPES,
            sandboxSessionApiKey: SESSION_API_KEY,
        })
        await provisioner.undeploy(makeInstance())

        expect(deletions).toEqual(['containers/w-001', 'volumes/sepal-tmp.inst-abc123'])
    })

    test('succeeds when the instance has no tmp volume', async () => {
        globalThis.fetch = jest.fn(async url => {
            if (url.includes('/containers/json')) {
                return {ok: true, status: 200, text: async () => '[]'}
            }
            return {ok: false, status: 404, text: async () => '{"message":"no such volume"}'}
        })

        const provisioner = createDockerInstanceProvisioner({
            config: CONFIG,
            instanceTypes: INSTANCE_TYPES,
            sandboxSessionApiKey: SESSION_API_KEY,
        })

        await expect(provisioner.undeploy(makeInstance())).resolves.toBeUndefined()
    })

    test('undeploy deletes no container when no .worker containers exist', async () => {
        let deleteCallCount = 0

        globalThis.fetch = jest.fn(async (url, opts) => {
            const method = opts?.method ?? 'GET'
            if (url.includes('/containers/json')) {
                return {ok: true, status: 200, text: async () => JSON.stringify([])}
            }
            if (method === 'DELETE' && url.includes('/containers/')) {
                deleteCallCount++
                return {ok: true, status: 204, text: async () => ''}
            }
            return {ok: true, status: 200, text: async () => '{}'}
        })

        const provisioner = createDockerInstanceProvisioner({
            config: CONFIG,
            instanceTypes: INSTANCE_TYPES,
            sandboxSessionApiKey: SESSION_API_KEY,
        })
        await provisioner.undeploy(makeInstance())

        expect(deleteCallCount).toBe(0)
    })
})

describe('instanceStatus', () => {
    beforeEach(() => {
        mockReadFileSync.mockReturnValue('ssh-rsa test')
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

    test('no container is created when the key is never found', async () => {
        let created = false
        setupFetchMock({captureCreate: () => { created = true }})

        const provisioner = createDockerInstanceProvisioner({
            config: CONFIG,
            instanceTypes: INSTANCE_TYPES,
            sandboxSessionApiKey: NULL_API_KEY_IMPL,
        })

        await expect(provisioner.provisionInstance(makeInstance())).rejects.toThrow(/api key/)
        expect(created).toBe(false)
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
            sandboxSessionApiKey: SESSION_API_KEY,
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
    workerAmiVersion: 'test',
    syslogAddress: null,
}

const NOW_S = Math.floor(Date.now() / 1000)
const OLD = NOW_S - 3600      // well past the grace period
const YOUNG = NOW_S - 60      // within the grace period
const isoDate = seconds => new Date(seconds * 1000).toISOString()

// makeFetch — GET containers/json returns `containers`, GET volumes returns `volumes`; every other
// call records + succeeds.
const makeFetch = (containers, volumes = []) => {
    const requests = []
    const fetch = jest.fn(async (url, init = {}) => {
        const method = init.method ?? 'GET'
        requests.push({url, method})
        const body = url.includes('containers/json')
            ? JSON.stringify(containers)
            : method === 'GET' && new URL(url).pathname.endsWith('/volumes')
                ? JSON.stringify({Volumes: volumes})
                : ''
        return {ok: true, status: 200, text: async () => body}
    })
    return {fetch, requests}
}

const deletedVolumeNames = requests => requests
    .filter(({method, url}) => method === 'DELETE' && url.includes('/volumes/'))
    .map(({url}) => url.match(/volumes\/([^/?]+)/)[1])

const makeProvisioner = ({defaultDaemonHost = 'daemon-host'} = {}) =>
    createDockerInstanceProvisioner({
        config: ORPHAN_CONFIG,
        instanceTypes: [],
        sandboxSessionApiKey: {apiKeyForInstance: async () => null},
        defaultDaemonHost,
    })

const deletedContainerIds = requests => requests
    .filter(({method, url}) => method === 'DELETE' && url.includes('/containers/'))
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

    it('deletes tmp volumes of no live instance, once past the grace period', async () => {
        const {fetch, requests} = makeFetch([], [
            {Name: 'sepal-tmp.aaa', CreatedAt: isoDate(OLD)},
            {Name: 'sepal-tmp.bbb', CreatedAt: isoDate(OLD)},
            {Name: 'sepal-tmp.ccc', CreatedAt: isoDate(YOUNG)},
            {Name: 'other-sepal-tmp.ddd', CreatedAt: isoDate(OLD)},
        ])
        global.fetch = fetch

        const removed = await makeProvisioner().removeOrphanedContainers(['aaa'])

        expect(deletedVolumeNames(requests)).toEqual(['sepal-tmp.bbb'])
        expect(removed).toEqual(['sepal-tmp.bbb'])
    })

    it('deletes an orphaned container before its tmp volume', async () => {
        const {fetch, requests} = makeFetch(
            [{Id: 'c-orphan', Names: ['/sandbox.admin.lofty-reef.bbb'], Created: OLD}],
            [{Name: 'sepal-tmp.bbb', CreatedAt: isoDate(OLD)}],
        )
        global.fetch = fetch

        await makeProvisioner().removeOrphanedContainers([])

        const deletions = requests.filter(({method}) => method === 'DELETE').map(({url}) => new URL(url).pathname)
        expect(deletions).toEqual([
            expect.stringMatching(/containers\/c-orphan$/),
            expect.stringMatching(/volumes\/sepal-tmp\.bbb$/),
        ])
    })

    it('is a no-op without a defaultDaemonHost (dedicated-host hosting, e.g. AWS)', async () => {
        const {fetch} = makeFetch([])
        global.fetch = fetch

        const removed = await makeProvisioner({defaultDaemonHost: null}).removeOrphanedContainers(['aaa'])

        expect(fetch).not.toHaveBeenCalled()
        expect(removed).toEqual([])
    })
})

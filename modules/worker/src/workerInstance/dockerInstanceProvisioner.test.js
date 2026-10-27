import assert from 'node:assert/strict'
import {afterEach, beforeEach, describe, it, mock, test} from 'node:test'
import {isDeepStrictEqual} from 'node:util'

import {assertMatches} from '#sepal/testSupport/assert'
import {callsOf} from '#sepal/testSupport/mock'

import {instanceName} from '../instanceName.js'
import {createDockerInstanceProvisioner} from './dockerInstanceProvisioner.js'
import {createApiKeyRetryWrapper, NULL_API_KEY_IMPL} from './sandboxSessionApiKey.js'

// Provisioning refuses without a key, so this stands in for the session lookup wherever the key
// itself is not the subject.
const SESSION_API_KEY = {apiKeyForSession: async () => 'session-key'}

const userPublicKey = username => `ssh-rsa AAAAB3NzaC1yc2E Sandbox key for ${username}`
const USER_PUBLIC_KEYS = {publicKey: async username => userPublicKey(username)}

const CONFIG = {
    workerAmiVersion: '5.1.0',
    sepalHost: 'sepal.example.com',
    sepalHostDataDir: '/data',
    dockerPort: 2375,
    dockerEntryPoint: 'v1.38',
    dockerRegistryHost: 'registry.example.com',
    syslogAddress: null,
}

const CONFIG_WITH_SYSLOG = {
    ...CONFIG,
    syslogAddress: 'udp://syslog.example.com:514',
}

const INSTANCE_TYPE_T3A = {
    id: 'T3aSmall',
    name: 't3a.small',
    tag: 't1',
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

// A helper container (formatting, preparing the tmp volume) ran to completion with this exit code.
const dockerWaitExit = code => ({ok: true, status: 200, text: async () => JSON.stringify({StatusCode: code})})

const setupFetchMock = ({captureCreate} = {}) => {
    globalThis.fetch = mock.fn(async (url, opts) => {
        if (url.endsWith('/wait')) return dockerWaitExit(0)
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
        setupFetchMock({captureCreate: body => { capturedBody = body }})
    })

    const runProvision = (cfg = CONFIG) => {
        const provisioner = createDockerInstanceProvisioner({
            config: cfg,
            instanceTypes: INSTANCE_TYPES,
            sandboxSessionApiKey: SESSION_API_KEY,
            userPublicKeys: USER_PUBLIC_KEYS,
        })
        return provisioner.provisionInstance(makeInstance())
    }

    test('Image field uses registry/openforis/name:version format', async () => {
        await runProvision()
        assert.equal(capturedBody.Image, 'registry.example.com/openforis/sandbox:5.1.0')
    })

    test('Tty is true', async () => {
        await runProvision()
        assert.equal(capturedBody.Tty, true)
    })

    test('Cmd matches sandbox runCommand', async () => {
        await runProvision()
        assert.deepEqual(capturedBody.Cmd, ['/script/init_container.sh'])
    })

    test('Env contains the public key of the reservation\'s user', async () => {
        await runProvision()
        assert.ok(capturedBody.Env.includes(`USER_PUBLIC_KEY=${userPublicKey('alice')}`))
    })

    test('Env contains the session api key', async () => {
        await runProvision()
        assert.ok(capturedBody.Env.includes('SEPAL_API_KEY=session-key'))
    })

    test('Env contains SEPAL_HOST', async () => {
        await runProvision()
        assert.ok(capturedBody.Env.includes('SEPAL_HOST=sepal.example.com'))
    })

    test('Env contains NVIDIA_VISIBLE_DEVICES=all', async () => {
        await runProvision()
        assert.ok(capturedBody.Env.includes('NVIDIA_VISIBLE_DEVICES=all'))
    })

    test('Env contains CARTODB_BASEMAP_KEY when configured', async () => {
        await runProvision({...CONFIG, cartoDbBasemapKey: 'carto-key'})
        assert.ok(capturedBody.Env.includes('CARTODB_BASEMAP_KEY=carto-key'))
    })

    test('Env contains CARTODB_BASEMAP_KEY empty when unconfigured', async () => {
        await runProvision()
        assert.ok(capturedBody.Env.includes('CARTODB_BASEMAP_KEY='))
    })

    test('HostConfig.Binds includes userHome mount', async () => {
        await runProvision()
        assert.ok(
            capturedBody.HostConfig.Binds.includes('/data/sepal/home/alice:/home/sepal-user')
        )
    })

    test('HostConfig.Binds mounts the instance\'s tmp volume at /tmp, /var/tmp and ~/tmp, without the image\'s /tmp', async () => {
        await runProvision()
        assert.ok(new Set([
            'sepal-tmp.inst-abc123:/tmp:nocopy',
            'sepal-tmp.inst-abc123:/var/tmp:nocopy',
            'sepal-tmp.inst-abc123:/home/sepal-user/tmp:nocopy',
        ]).isSubsetOf(new Set(capturedBody.HostConfig.Binds)))
    })

    test('HostConfig.Tmpfs has /ram entry with size', async () => {
        await runProvision()
        assert.ok('/ram' in Object(capturedBody.HostConfig.Tmpfs))
        assert.match(capturedBody.HostConfig.Tmpfs['/ram'], /^rw,exec,nosuid,size=\d+$/)
    })

    test('HostConfig.ShmSize is a number (half of ramBytes)', async () => {
        await runProvision()
        const expectedShmSize = Math.floor(INSTANCE_TYPE_T3A.ramBytes / 2)
        assert.equal(capturedBody.HostConfig.ShmSize, expectedShmSize)
    })

    test('HostConfig.Devices is empty for non-GPU instance type', async () => {
        await runProvision()
        assert.deepEqual(capturedBody.HostConfig.Devices, [])
    })

    test('HostConfig.Devices includes GPU devices for GPU instance type', async () => {
        const provisioner = createDockerInstanceProvisioner({
            config: CONFIG,
            instanceTypes: INSTANCE_TYPES,
            sandboxSessionApiKey: SESSION_API_KEY,
            userPublicKeys: USER_PUBLIC_KEYS,
        })
        await provisioner.provisionInstance(makeInstance({type: 'G5Xlarge'}))
        assert.deepEqual(capturedBody.HostConfig.Devices, [
            {PathOnHost: '/dev/nvidia0', PathInContainer: '/dev/nvidia0', CgroupPermissions: 'mrw'},
            {PathOnHost: '/dev/nvidiactl', PathInContainer: '/dev/nvidiactl', CgroupPermissions: 'mrw'},
        ])
    })

    test('HostConfig.LogConfig is null when syslogAddress not set', async () => {
        await runProvision()
        assert.equal(capturedBody.HostConfig.LogConfig, null)
    })

    test('HostConfig.LogConfig logs to syslog under the sandbox\'s user and instance name', async () => {
        await runProvision(CONFIG_WITH_SYSLOG)
        assert.partialDeepStrictEqual(capturedBody.HostConfig.LogConfig, {
            Type: 'syslog',
            Config: {
                'syslog-address': 'udp://syslog.example.com:514',
                'tag': `sandbox/alice/${instanceName('sess-1')}`,
            },
        })
    })

    test('ExposedPorts contains all sandbox ports', async () => {
        await runProvision()
        assert.partialDeepStrictEqual(capturedBody.ExposedPorts, {
            '22/tcp': {},
            '8787/tcp': {},
            '3838/tcp': {},
            '8888/tcp': {},
        })
    })

    test('HostConfig.PortBindings maps exposed to host ports', async () => {
        await runProvision()
        const pb = capturedBody.HostConfig.PortBindings
        assert.deepEqual(pb['22/tcp'], [{HostPort: '222'}])
        assert.deepEqual(pb['8787/tcp'], [{HostPort: '8787'}])
        assert.deepEqual(pb['3838/tcp'], [{HostPort: '3838'}])
        assert.deepEqual(pb['8888/tcp'], [{HostPort: '8888'}])
    })

    test('NetworkingConfig.EndpointsConfig.sepal exists', async () => {
        await runProvision()
        assert.notEqual(capturedBody.NetworkingConfig.EndpointsConfig.sepal, undefined)
    })

    test('Env names the instance type by its tag', async () => {
        await runProvision()
        assert.ok(capturedBody.Env.includes('SEPAL_INSTANCE_TYPE=t1'))
    })

    test('Env names an untagged instance type by its name', async () => {
        const provisioner = createDockerInstanceProvisioner({
            config: CONFIG,
            instanceTypes: INSTANCE_TYPES,
            sandboxSessionApiKey: SESSION_API_KEY,
            userPublicKeys: USER_PUBLIC_KEYS,
        })
        await provisioner.provisionInstance(makeInstance({type: 'G5Xlarge'}))
        assert.ok(capturedBody.Env.includes('SEPAL_INSTANCE_TYPE=g5.xlarge'))
    })

    // The shell prompt inside the sandbox starts with the hostname, so the hostname is what a user
    // reads to tell one open terminal from another — it has to be the same two-word name every
    // other surface calls this instance, not the container id Docker would otherwise assign.
    test('Hostname is the instance\'s two-word name', async () => {
        await runProvision()
        assert.equal(capturedBody.Hostname, instanceName('sess-1'))
    })

    test('HostConfig.ExtraHosts defaults to empty array', async () => {
        await runProvision()
        assert.deepEqual(capturedBody.HostConfig.ExtraHosts, [])
    })

    test('HostConfig.ExtraHosts reflects passed extraHosts', async () => {
        const provisioner = createDockerInstanceProvisioner({
            config: CONFIG,
            instanceTypes: INSTANCE_TYPES,
            sandboxSessionApiKey: SESSION_API_KEY,
            userPublicKeys: USER_PUBLIC_KEYS,
            extraHosts: ['sepal.example.com:host-gateway'],
        })
        await provisioner.provisionInstance(makeInstance())
        assert.deepEqual(capturedBody.HostConfig.ExtraHosts, ['sepal.example.com:host-gateway'])
    })
})

describe('provisionInstance sequence', () => {
    const calls = []

    beforeEach(() => {
        calls.length = 0

        globalThis.fetch = mock.fn(async (url, opts) => {
            if (url.endsWith('/wait')) return dockerWaitExit(0)
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
            userPublicKeys: USER_PUBLIC_KEYS,
        })
        await provisioner.provisionInstance(makeInstance())
        const paths = calls.map(c => `${c.method} ${new URL(c.url).pathname}`)
        const at = pattern => paths.findIndex(path => pattern.test(path))
        assert.match(paths[0], /GET.*containers\/json/)
        assert.ok(
            at(/DELETE.*volumes\/sepal-tmp\.inst-abc123$/) < at(/POST.*volumes\/create$/)
        )
        assert.ok(
            at(/POST.*volumes\/create$/) < at(/POST.*containers\/sandbox\.alice\..*\/start$/)
        )
        assert.ok(at(/POST.*containers\/sandbox\.alice\..*\/start$/) < at(/POST.*exec$/))
        assert.ok(at(/POST.*exec$/) < at(/POST.*exec\/.*\/start$/))
    })
})

describe('provisionInstance on a scratch device', () => {
    const recordingFetch = ({formatExitCode = 0} = {}) => {
        const requests = []
        globalThis.fetch = mock.fn(async (url, opts = {}) => {
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
        userPublicKeys: USER_PUBLIC_KEYS,
    })

    const formatName = 'sandbox.format-tmp.inst-abc123'

    test('formats the device, then puts the tmp volume on it before creating the container', async () => {
        const requests = recordingFetch()

        await makeProvisioner().provisionInstance(makeInstance(), {tmpDevice: '/dev/xvdg'})

        const format = requests.find(r => r.pathname.endsWith('/containers/create') && r.name === formatName)
        assertMatches(format.body, {
            Image: 'registry.example.com/openforis/sandbox:5.1.0',
            User: 'root',
            HostConfig: {Privileged: true, Binds: ['/:/host']},
        })
        assert.deepEqual(format.body.Entrypoint.slice(0, 2), ['chroot', '/host'])
        assert.equal(format.body.Entrypoint.at(-1), '/dev/xvdg')
        const volume = requests.find(r => r.pathname.endsWith('/volumes/create'))
        assert.deepEqual(volume.body, {
            Name: 'sepal-tmp.inst-abc123',
            Driver: 'local',
            DriverOpts: {type: 'xfs', device: '/dev/xvdg', o: 'noatime'},
        })
        const steps = requests.map(r => r.pathname.endsWith('/containers/create') ? `create ${r.name}` : `${r.method} ${r.pathname.split('/').slice(-2).join('/')}`)
        assert.deepEqual(
            [`POST ${formatName}/wait`, `DELETE containers/${formatName}`, 'POST volumes/create'].filter(expected => !steps.some(item => isDeepStrictEqual(item, expected))),
            []
        )
        assert.ok(
            steps.indexOf(`POST ${formatName}/wait`) < steps.indexOf('POST volumes/create')
        )
        assert.ok(
            steps.indexOf(`DELETE containers/${formatName}`) > steps.indexOf(`POST ${formatName}/wait`)
        )
        assert.ok(
            steps.indexOf('POST volumes/create') < steps.findIndex(step => step.startsWith('create sandbox.alice.'))
        )
    })

    test('fails, removing the format container, when the device cannot be formatted', async () => {
        const requests = recordingFetch({formatExitCode: 1})

        await assert.rejects(
            makeProvisioner().provisionInstance(makeInstance(), {tmpDevice: '/dev/xvdg'}),
            /format-tmp failed .* \(exit 1\): mkfs.xfs: no such device/
        )

        assert.equal(
            requests.some(r => r.method === 'DELETE' && r.pathname.endsWith(`/containers/${formatName}`)),
            true
        )
        assert.equal(requests.some(r => r.pathname.endsWith('/volumes/create')), false)
    })

    test('without a device, creates a plain tmp volume', async () => {
        const requests = recordingFetch()

        await makeProvisioner().provisionInstance(makeInstance())

        assert.equal(requests.some(r => r.name === formatName), false)
        const volume = requests.find(r => r.pathname.endsWith('/volumes/create'))
        assert.deepEqual(
            volume.body,
            {Name: 'sepal-tmp.inst-abc123', Driver: 'local', DriverOpts: {}}
        )
    })

    // The session's containers mount it nocopy, so nothing else sets the empty volume's mode.
    for (const [tmpDevice] of [['/dev/xvdg'], [null]]) {
        test(
            `makes the tmp volume world-writable before creating the container (device: ${tmpDevice})`,
            async () => {
                const requests = recordingFetch()

                await makeProvisioner().provisionInstance(makeInstance(), {tmpDevice})

                const createdAt = name => requests.findIndex(r => r.pathname.endsWith('/containers/create') && r.name?.startsWith(name))
                const prepare = requests[createdAt('sandbox.prepare-tmp.inst-abc123')]
                assertMatches(prepare.body, {
                    User: 'root',
                    Entrypoint: ['chmod', '1777', '/tmp-volume'],
                    HostConfig: {Binds: ['sepal-tmp.inst-abc123:/tmp-volume:nocopy']},
                })
                assert.ok(createdAt('sandbox.prepare-tmp.') < createdAt('sandbox.alice.'))
            }
        )
    }
})

describe('provisionInstance deletes .worker containers only', () => {

    test('deletes .worker container but not other containers', async () => {
        const deletedIds = []

        globalThis.fetch = mock.fn(async (url, opts) => {
            if (url.endsWith('/wait')) return dockerWaitExit(0)
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
            userPublicKeys: USER_PUBLIC_KEYS,
        })
        await provisioner.provisionInstance(makeInstance())

        assert.ok(deletedIds.includes('worker-id-1'))
        assert.ok(!deletedIds.includes('other-id-1'))
    })
})

describe('undeploy', () => {

    test('calls GET containers/json then DELETE for .worker containers', async () => {
        const deletedIds = []
        let listCalled = false

        globalThis.fetch = mock.fn(async (url, opts) => {
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

        assert.equal(listCalled, true)
        assert.deepEqual(deletedIds, ['w-001'])
    })

    test('on the shared daemon, deletes this instance\'s container and leaves another instance\'s', async () => {
        const deletedIds = []

        globalThis.fetch = mock.fn(async (url, opts) => {
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

        assert.deepEqual(deletedIds, ['mine'])
    })

    test('deletes the instance\'s tmp volume once its containers are gone', async () => {
        const deletions = []

        globalThis.fetch = mock.fn(async (url, opts) => {
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

        assert.deepEqual(deletions, ['containers/w-001', 'volumes/sepal-tmp.inst-abc123'])
    })

    test('succeeds when the instance has no tmp volume', async () => {
        globalThis.fetch = mock.fn(async url => {
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

        assert.equal(await provisioner.undeploy(makeInstance()), undefined)
    })

    test('undeploy deletes no container when no .worker containers exist', async () => {
        let deleteCallCount = 0

        globalThis.fetch = mock.fn(async (url, opts) => {
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

        assert.equal(deleteCallCount, 0)
    })
})

describe('instanceStatus', () => {

    const probe = () => createDockerInstanceProvisioner({
        config: CONFIG,
        instanceTypes: INSTANCE_TYPES,
        sandboxSessionApiKey: NULL_API_KEY_IMPL,
    }).instanceStatus(makeInstance())

    const inspectResponds = body => {
        globalThis.fetch = mock.fn(
            async () => ({ok: true, status: 200, text: async () => JSON.stringify(body)})
        )
    }

    test('PROVISIONED when the container is running', async () => {
        inspectResponds({State: {Running: true}})
        assert.equal(await probe(), 'PROVISIONED')
    })

    test('MISSING when Docker says there is no such container', async () => {
        globalThis.fetch = mock.fn(
            async () => ({ok: false, status: 404, text: async () => 'No such container'})
        )
        assert.equal(await probe(), 'MISSING')
    })

    test('MISSING when the container exists but is not running', async () => {
        inspectResponds({State: {Running: false}})
        assert.equal(await probe(), 'MISSING')
    })

    // The bug this probe exists to fix: a transient blip must never read as "the instance is gone".
    test('UNKNOWN when the daemon is unreachable', async () => {
        globalThis.fetch = mock.fn(async () => {throw new Error('ECONNREFUSED')})
        assert.equal(await probe(), 'UNKNOWN')
    })

    test('UNKNOWN when the daemon answers 5xx', async () => {
        globalThis.fetch = mock.fn(async () => ({ok: false, status: 503, text: async () => 'unavailable'}))
        assert.equal(await probe(), 'UNKNOWN')
    })

    test('UNKNOWN when the probe times out', async () => {
        globalThis.fetch = mock.fn(async () => {
            const error = new Error('The operation was aborted due to timeout')
            error.name = 'TimeoutError'
            throw error
        })
        assert.equal(await probe(), 'UNKNOWN')
    })

    test('UNKNOWN, not MISSING, for a retired worker type', async () => {
        inspectResponds({State: {Running: true}})
        const status = await createDockerInstanceProvisioner({
            config: CONFIG,
            instanceTypes: INSTANCE_TYPES,
            sandboxSessionApiKey: NULL_API_KEY_IMPL,
        }).instanceStatus(makeInstance({reservation: {username: 'alice', workerType: 'task-executor', sessionId: 'sess-1'}}))
        assert.equal(status, 'UNKNOWN')
    })

    test('inspects the container instead of running an exec in it', async () => {
        inspectResponds({State: {Running: true}})
        await probe()
        const urls = callsOf(globalThis.fetch).map(([url]) => url)
        assert.equal(urls.some(url => url.includes('/exec')), false)
        assert.equal(urls.every(url => /\/containers\/[^/]+\/json$/.test(url)), true)
    })

    test('is bounded by a timeout so an unreachable host cannot stall the sweep', async () => {
        inspectResponds({State: {Running: true}})
        await probe()
        const [, init] = globalThis.fetch.mock.calls[0].arguments
        assert.ok(init.signal instanceof AbortSignal)
    })
})

describe('apiKey retry', () => {

    test('apiKey is passed to SANDBOX Env when non-null', async () => {
        let capturedEnv = null
        setupFetchMock({captureCreate: body => { capturedEnv = body.Env }})

        let callCount = 0
        const mockApiKeyImpl = {
            apiKeyForSession: mock.fn(async () => {
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
            userPublicKeys: USER_PUBLIC_KEYS,
        })
        await provisioner.provisionInstance(makeInstance())

        assert.ok(capturedEnv.includes('SEPAL_API_KEY=my-api-key'))
        assert.equal(mockApiKeyImpl.apiKeyForSession.mock.callCount(), 5)
    })

    test('no container is created when the key is never found', async () => {
        let created = false
        setupFetchMock({captureCreate: () => { created = true }})

        const provisioner = createDockerInstanceProvisioner({
            config: CONFIG,
            instanceTypes: INSTANCE_TYPES,
            sandboxSessionApiKey: NULL_API_KEY_IMPL,
        })

        await assert.rejects(provisioner.provisionInstance(makeInstance()), /api key/)
        assert.equal(created, false)
    })

    // A provision that outlived its session must leave the next session's sandbox standing.
    test('deletes nothing when the instance is no longer the session\'s', async () => {
        const methods = []
        globalThis.fetch = mock.fn(async (url, opts) => {
            methods.push(opts?.method ?? 'GET')
            return {ok: true, status: 200, text: async () => JSON.stringify([{Id: 'bob-id', Names: ['/sandbox.bob.inst-abc123']}])}
        })
        const sandboxSessionApiKey = {
            apiKeyForSession: mock.fn(async (_instanceId, sessionId) => sessionId === 'sess-bob' ? 'bobs-key' : null)
        }
        const provisioner = createDockerInstanceProvisioner({config: CONFIG, instanceTypes: INSTANCE_TYPES, sandboxSessionApiKey})
        const instance = makeInstance()

        await assert.rejects(provisioner.provisionInstance(instance), /api key/)

        assert.deepEqual(callsOf(sandboxSessionApiKey.apiKeyForSession), [[instance.id, instance.reservation.sessionId]])
        assert.deepEqual(methods.filter(method => method !== 'GET'), [])
    })
})

describe('user public key', () => {
    test('a key that cannot be fetched fails the provision before any container is touched', async () => {
        const methods = []
        globalThis.fetch = mock.fn(async (url, opts) => {
            methods.push(opts?.method ?? 'GET')
            return {ok: true, status: 200, text: async () => '[]'}
        })
        const provisioner = createDockerInstanceProvisioner({
            config: CONFIG,
            instanceTypes: INSTANCE_TYPES,
            sandboxSessionApiKey: SESSION_API_KEY,
            userPublicKeys: {publicKey: async () => { throw new Error('user module unavailable') }},
        })

        await assert.rejects(provisioner.provisionInstance(makeInstance()), /user module unavailable/)

        assert.deepEqual(methods.filter(method => method !== 'GET'), [])
    })
})

describe('createApiKeyRetryWrapper', () => {
    test('returns null when impl always returns null (all retries exhausted)', async () => {
        const impl = {apiKeyForSession: mock.fn(async () => null)}
        const wrapper = createApiKeyRetryWrapper(impl, {retries: 5, delayMs: 0})
        const result = await wrapper.apiKeyForSession('i-001')
        assert.equal(result, null)
        assert.equal(impl.apiKeyForSession.mock.callCount(), 5)
    })

    test('returns value on 3rd attempt when first 2 return null', async () => {
        let count = 0
        const impl = {
            apiKeyForSession: mock.fn(async () => {
                count++
                return count < 3 ? null : 'api-key-value'
            })
        }
        const wrapper = createApiKeyRetryWrapper(impl, {retries: 5, delayMs: 0})
        const result = await wrapper.apiKeyForSession('i-002')
        assert.equal(result, 'api-key-value')
        assert.equal(impl.apiKeyForSession.mock.callCount(), 3)
    })

    test('returns value on first attempt when immediately available', async () => {
        const impl = {apiKeyForSession: mock.fn(async () => 'immediate-key')}
        const wrapper = createApiKeyRetryWrapper(impl, {retries: 5, delayMs: 0})
        const result = await wrapper.apiKeyForSession('i-003')
        assert.equal(result, 'immediate-key')
        assert.equal(impl.apiKeyForSession.mock.callCount(), 1)
    })

    test('sleeps delayMs between retries, and not after the successful attempt', async () => {
        const slept = []
        let count = 0
        const impl = {
            apiKeyForSession: mock.fn(async () => {
                count++
                return count < 3 ? null : 'key'
            })
        }
        const wrapper = createApiKeyRetryWrapper(impl, {
            retries: 5,
            delayMs: 50,
            _sleep: async ms => { slept.push(ms) },
        })
        const result = await wrapper.apiKeyForSession('i-004')
        assert.equal(result, 'key')
        assert.equal(impl.apiKeyForSession.mock.callCount(), 3)
        // Two failed attempts → two sleeps; the third succeeds and returns without sleeping.
        assert.deepEqual(slept, [50, 50])
    })

    test('NULL_API_KEY_IMPL always returns null', async () => {
        const result = await NULL_API_KEY_IMPL.apiKeyForSession('any-id')
        assert.equal(result, null)
    })
})

describe('waitUntilDockerIsAvailable', () => {

    test('succeeds after transient errors then success', async () => {
        let callCount = 0
        globalThis.fetch = mock.fn(async (url, opts) => {
            if (url.endsWith('/wait')) return dockerWaitExit(0)
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
            userPublicKeys: USER_PUBLIC_KEYS,
        })
        assert.equal(await provisioner.provisionInstance(makeInstance()), undefined)
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
    const fetch = mock.fn(async (url, init = {}) => {
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
        sandboxSessionApiKey: {apiKeyForSession: async () => null},
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

        assert.deepEqual(deletedContainerIds(requests), ['c-orphan'])
        assert.deepEqual(removed, ['/sandbox.admin.bbb'])
    })

    it('keeps containers whose name suffix matches a live instance', async () => {
        const {fetch, requests} = makeFetch([
            {Id: 'c-live', Names: ['/sandbox.admin.aaa'], Created: OLD},
        ])
        global.fetch = fetch

        const removed = await makeProvisioner().removeOrphanedContainers(['aaa'])

        assert.deepEqual(deletedContainerIds(requests), [])
        assert.deepEqual(removed, [])
    })

    it('leaves task-manager task containers on the shared daemon alone', async () => {
        const {fetch, requests} = makeFetch([
            {Id: 'c-task', Names: ['/task.alice.0f3c2a9e-1b2c-4d5e-8f90-123456789abc'], Created: OLD},
            {Id: 'c-orphan', Names: ['/sandbox.alice.fancy-aspen.i-orphan'], Created: OLD},
        ])
        global.fetch = fetch

        const removed = await makeProvisioner().removeOrphanedContainers([])

        assert.deepEqual(deletedContainerIds(requests), ['c-orphan'])
        assert.deepEqual(removed, ['/sandbox.alice.fancy-aspen.i-orphan'])
    })

    it('keeps a current-format container whose name ends with a live instance id', async () => {
        const {fetch, requests} = makeFetch([
            {Id: 'c-live', Names: ['/sandbox.admin.lofty-reef.aaa'], Created: OLD},
        ])
        global.fetch = fetch

        const removed = await makeProvisioner().removeOrphanedContainers(['aaa'])

        assert.deepEqual(deletedContainerIds(requests), [])
        assert.deepEqual(removed, [])
    })

    it('keeps AWS-style live instance ids', async () => {
        const {fetch, requests} = makeFetch([
            {Id: 'c-live', Names: ['/sandbox.admin.i-0abc123'], Created: OLD},
        ])
        global.fetch = fetch

        await makeProvisioner().removeOrphanedContainers(['i-0abc123'])

        assert.deepEqual(deletedContainerIds(requests), [])
    })

    it('keeps legacy-named containers that carry a live instance id elsewhere in the name', async () => {
        const {fetch, requests} = makeFetch([
            {Id: 'c-legacy', Names: ['/aaa.sandbox.worker'], Created: OLD},
        ])
        global.fetch = fetch

        await makeProvisioner().removeOrphanedContainers(['aaa'])

        assert.deepEqual(deletedContainerIds(requests), [])
    })

    it('keeps containers younger than the grace period', async () => {
        const {fetch, requests} = makeFetch([
            {Id: 'c-fresh', Names: ['/sandbox.admin.bbb'], Created: YOUNG},
        ])
        global.fetch = fetch

        await makeProvisioner().removeOrphanedContainers(['aaa'])

        assert.deepEqual(deletedContainerIds(requests), [])
    })

    it('ignores non-worker containers', async () => {
        const {fetch, requests} = makeFetch([
            {Id: 'c-mysql', Names: ['/mysql'], Created: OLD},
        ])
        global.fetch = fetch

        await makeProvisioner().removeOrphanedContainers([])

        assert.deepEqual(deletedContainerIds(requests), [])
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

        assert.deepEqual(deletedVolumeNames(requests), ['sepal-tmp.bbb'])
        assert.deepEqual(removed, ['sepal-tmp.bbb'])
    })

    it('deletes an orphaned container before its tmp volume', async () => {
        const {fetch, requests} = makeFetch(
            [{Id: 'c-orphan', Names: ['/sandbox.admin.lofty-reef.bbb'], Created: OLD}],
            [{Name: 'sepal-tmp.bbb', CreatedAt: isoDate(OLD)}],
        )
        global.fetch = fetch

        await makeProvisioner().removeOrphanedContainers([])

        const deletions = requests.filter(({method}) => method === 'DELETE').map(({url}) => new URL(url).pathname)
        assert.equal(deletions.length, 2)
        assert.match(deletions[0], /containers\/c-orphan$/)
        assert.match(deletions[1], /volumes\/sepal-tmp\.bbb$/)
    })

    it('is a no-op without a defaultDaemonHost (dedicated-host hosting, e.g. AWS)', async () => {
        const {fetch} = makeFetch([])
        global.fetch = fetch

        const removed = await makeProvisioner({defaultDaemonHost: null}).removeOrphanedContainers(['aaa'])

        assert.equal(fetch.mock.callCount(), 0)
        assert.deepEqual(removed, [])
    })
})

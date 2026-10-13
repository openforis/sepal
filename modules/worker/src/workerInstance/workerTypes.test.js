import {jest} from '@jest/globals'

jest.unstable_mockModule('node:fs', () => ({
    default: {
        readFileSync: jest.fn(() => 'ssh-rsa PUBLIC-KEY\n'),
    },
}))

const {createWorkerType, dataCacheVolumeName, dataMountDir, sidecarContainerName, SANDBOX} = await import('./workerTypes.js')
const {instanceName} = await import('../instanceName.js')

const SESSION_ID = '25a02f1c-9e59-491e-b5ac-80b95dcc274e'

const instance = {
    id: '3f2b8c1a-9d44-4e21-8f77-2c6a5b0e91d3',
    reservation: {username: 'admin', workerType: SANDBOX, sessionId: SESSION_ID},
}

const config = () => ({
    sepalHostDataDir: '/host/data',
    sepalHost: 'sepal.example.org',
})

describe('image containerName', () => {
    it('is "{image}.{username}.{instance name}.{instance id}"', () => {
        const workerType = createWorkerType(SANDBOX, instance, config())
        expect(workerType.images[0].containerName(instance))
            .toBe(`sandbox.admin.${instanceName(SESSION_ID)}.${instance.id}`)

        const localInstance = {...instance, host: instance.id, daemonHost: 'host.docker.internal'}
        const localWorkerType = createWorkerType(SANDBOX, localInstance, config())
        expect(localWorkerType.images[0].containerName(localInstance))
            .toBe(`sandbox.admin.${instanceName(SESSION_ID)}.${instance.id}`)
    })

    // The two-word name identifies the session; the trailing instance id is what the shared-daemon
    // ownership lookups match on, so an EC2 id has to survive into the name unchanged.
    it('ends with the instance id', () => {
        const awsInstance = {...instance, id: 'i-0abc123'}
        const workerType = createWorkerType(SANDBOX, awsInstance, config())
        expect(workerType.images[0].containerName(awsInstance))
            .toBe(`sandbox.admin.${instanceName(SESSION_ID)}.i-0abc123`)
    })

    // A reservation rebuilt from EC2 tags without a SessionId would otherwise name the container
    // "sandbox.admin.null" and lose it for good.
    it('throws when the reservation carries no session id', () => {
        const orphaned = {...instance, reservation: {username: 'admin', workerType: SANDBOX}}
        const workerType = createWorkerType(SANDBOX, orphaned, config())
        expect(() => workerType.images[0].containerName(orphaned)).toThrow(/session/i)
    })
})

describe('createWorkerType SANDBOX readiness', () => {
    it('waits only for sshd, not the on-demand servers', () => {
        const workerType = createWorkerType(
            SANDBOX,
            {...instance, reservation: {username: 'admin', workerType: SANDBOX}},
            config(),
            'api-key'
        )
        const [image] = workerType.images
        expect(image.waitCommand).toEqual(['/script/wait_until_initialized.sh', '22'])
        // Routing is unchanged — only readiness narrows.
        expect(image.exposedPorts).toEqual([22, 8787, 3838, 8888])
        expect(image.publishedPorts).toEqual({222: 22, 8787: 8787, 3838: 3838, 8888: 8888})
    })
})

describe('with Data enabled', () => {
    const dataConfig = () => ({
        ...config(),
        dataEnabled: true,
        dataMountRoot: '/var/lib/sepal/data-mounts',
        dataCacheMaxSize: '20G',
    })
    const data = {uid: 1001, gid: 1002}
    const create = () => createWorkerType(SANDBOX, instance, dataConfig(), 'session-key', data)

    it('starts the mount sidecar before the sandbox', () => {
        const {images} = create()

        expect(images.map(image => image.containerName(instance))).toEqual([
            sidecarContainerName(instance),
            `sandbox.admin.${instanceName(SESSION_ID)}.${instance.id}`,
        ])
        expect(sidecarContainerName(instance))
            .toBe(`sandbox.data-mount.admin.${instanceName(SESSION_ID)}.${instance.id}`)
    })

    it('mounts Data through a shared host directory with FUSE', () => {
        const [sidecar] = create().images

        expect(sidecar.name).toBe('sandbox')
        expect(sidecar.volumes).toEqual({
            [dataMountDir(dataConfig(), instance.id)]: '/mnt/host:rshared',
            [dataCacheVolumeName(instance.id)]: '/cache',
        })
        expect(sidecar.hostConfig).toEqual({
            CapAdd: ['SYS_ADMIN'],
            SecurityOpt: ['apparmor:unconfined'],
            Devices: [{PathOnHost: '/dev/fuse', PathInContainer: '/dev/fuse', CgroupPermissions: 'rwm'}],
        })
        expect(sidecar.environment).toEqual({
            SEPAL_API_KEY: 'session-key',
            SEPAL_HOST: 'sepal.example.org',
            DATA_UID: 1001,
            DATA_GID: 1002,
            DATA_CACHE_MAX_SIZE: '20G',
            DATA_MOUNT_POINT: '/mnt/host/data',
        })
        expect(sidecar.runCommand).toEqual(['/usr/local/bin/sepal-data', 'mount'])
        expect(sidecar.waitCommand).toEqual(['/usr/local/bin/sepal-data', 'wait-mounted', '30'])
        expect(sidecar).toMatchObject({essential: false, networkAlias: false, tmpfs: false, publishedPorts: {}, exposedPorts: []})
    })

    it('binds the mounted Data into the sandbox home', () => {
        const [, sandbox] = create().images

        expect(sandbox.volumes[`${dataMountDir(dataConfig(), instance.id)}/data`]).toBe('/home/sepal-user/data:rslave')
        expect(sandbox.environment.SEPAL_DATA_ENABLED).toBe('true')
        expect(sandbox).toMatchObject({essential: true, networkAlias: true, tmpfs: true, hostConfig: {}})
    })
})

describe('with Data disabled', () => {
    it('describes only the sandbox, exactly as before Data existed', () => {
        const {images} = createWorkerType(SANDBOX, instance, config(), 'session-key')

        expect(images).toHaveLength(1)
        expect(images[0].volumes).toEqual({
            '/host/data/sepal/shiny': '/shiny',
            '/host/data/sepal/shared': '/home/sepal-user/shared',
            '/host/data/sepal/jupyter/current-kernels': '/usr/local/share/jupyter/kernels/',
            '/host/data/sepal/home/admin': '/home/sepal-user',
            [`sepal-tmp.${instance.id}`]: ['/tmp:nocopy', '/var/tmp:nocopy', '/home/sepal-user/tmp:nocopy'],
        })
        expect(images[0].environment).toEqual({
            USER_PUBLIC_KEY: 'ssh-rsa PUBLIC-KEY\n',
            SEPAL_API_KEY: 'session-key',
            SEPAL_HOST: 'sepal.example.org',
            CARTODB_BASEMAP_KEY: '',
            NVIDIA_VISIBLE_DEVICES: 'all',
            NVIDIA_DRIVER_CAPABILITIES: 'all',
        })
    })
})

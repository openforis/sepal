import {jest} from '@jest/globals'

jest.unstable_mockModule('node:fs', () => ({
    default: {
        readFileSync: jest.fn(() => 'ssh-rsa PUBLIC-KEY\n'),
    },
}))

const {createWorkerType, SANDBOX} = await import('./workerTypes.js')
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

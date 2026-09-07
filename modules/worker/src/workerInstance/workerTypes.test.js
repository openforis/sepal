// TASK_EXECUTOR dev hot-reload mounts: with an empty/missing sepalHostProjectDir the binds
// degrade to '/modules/task/src' etc. — Docker then creates empty host dirs and mounts them
// OVER the task image's baked-in code, breaking the container with
// "Cannot find module /usr/local/src/sepal/modules/task/src/main.js".
// DEV must only add these mounts when sepalHostProjectDir is actually configured.

import {jest} from '@jest/globals'

jest.unstable_mockModule('node:fs', () => ({
    default: {
        mkdirSync: jest.fn(),
        chmodSync: jest.fn(),
        readFileSync: jest.fn(() => 'ssh-rsa PUBLIC-KEY\n'),
    },
}))

const {createWorkerType, SANDBOX, TASK_EXECUTOR} = await import('./workerTypes.js')
const {instanceName} = await import('../instanceName.js')

const SESSION_ID = '25a02f1c-9e59-491e-b5ac-80b95dcc274e'

const instance = {
    id: '3f2b8c1a-9d44-4e21-8f77-2c6a5b0e91d3',
    reservation: {username: 'admin', workerType: TASK_EXECUTOR, sessionId: SESSION_ID},
}

const config = ({deployEnvironment, sepalHostProjectDir}) => ({
    deployEnvironment,
    sepalHostProjectDir,
    sepalHostDataDir: '/host/data',
    sepalHost: 'sepal.example.org',
    googleEarthEnginePrivateKey: 'key',
})

const taskVolumes = workerType => workerType.images[0].volumes

describe('createWorkerType TASK_EXECUTOR dev mounts', () => {
    it('adds hot-reload mounts in DEV when sepalHostProjectDir is configured', () => {
        const workerType = createWorkerType(TASK_EXECUTOR, instance, config({
            deployEnvironment: 'DEV',
            sepalHostProjectDir: '/host/project',
        }))

        expect(taskVolumes(workerType)).toMatchObject({
            '/host/project/modules/task/src': '/usr/local/src/sepal/modules/task/src',
            '/host/project/lib/js/shared/src': '/usr/local/src/sepal/lib/js/shared/src',
            '/host/project/lib/js/ee/src': '/usr/local/src/sepal/lib/js/ee/src',
        })
    })

    it.each(['', undefined])(
        'skips hot-reload mounts in DEV when sepalHostProjectDir is %j',
        sepalHostProjectDir => {
            const workerType = createWorkerType(TASK_EXECUTOR, instance, config({
                deployEnvironment: 'DEV',
                sepalHostProjectDir,
            }))

            expect(Object.keys(taskVolumes(workerType))).toEqual([
                '/host/data/sepal/home/admin',
                '/host/data/sepal/home/admin/tmp/3f2b8c1a-9d44-4e21-8f77-2c6a5b0e91d3',
            ])
        }
    )

    it('skips hot-reload mounts outside DEV even when sepalHostProjectDir is configured', () => {
        const workerType = createWorkerType(TASK_EXECUTOR, instance, config({
            deployEnvironment: 'PRODUCTION',
            sepalHostProjectDir: '/host/project',
        }))

        expect(Object.keys(taskVolumes(workerType))).toEqual([
            '/host/data/sepal/home/admin',
            '/host/data/sepal/home/admin/tmp/3f2b8c1a-9d44-4e21-8f77-2c6a5b0e91d3',
        ])
    })
})

describe('image containerName', () => {
    it('is "{image}.{username}.{instance name}.{instance id}"', () => {
        const workerType = createWorkerType(TASK_EXECUTOR, instance, config({deployEnvironment: 'PRODUCTION'}))
        expect(workerType.images[0].containerName(instance))
            .toBe(`task.admin.${instanceName(SESSION_ID)}.${instance.id}`)

        const localInstance = {...instance, host: instance.id, daemonHost: 'host.docker.internal'}
        const localWorkerType = createWorkerType(TASK_EXECUTOR, localInstance, config({deployEnvironment: 'DEV'}))
        expect(localWorkerType.images[0].containerName(localInstance))
            .toBe(`task.admin.${instanceName(SESSION_ID)}.${instance.id}`)
    })

    // The two-word name identifies the session; the trailing instance id is what the shared-daemon
    // ownership lookups match on, so an EC2 id has to survive into the name unchanged.
    it('ends with the instance id', () => {
        const awsInstance = {...instance, id: 'i-0abc123'}
        const workerType = createWorkerType(TASK_EXECUTOR, awsInstance, config({deployEnvironment: 'PRODUCTION'}))
        expect(workerType.images[0].containerName(awsInstance))
            .toBe(`task.admin.${instanceName(SESSION_ID)}.i-0abc123`)
    })

    // A reservation rebuilt from EC2 tags without a SessionId would otherwise name the container
    // "task.admin.null" and lose it for good.
    it('throws when the reservation carries no session id', () => {
        const orphaned = {...instance, reservation: {username: 'admin', workerType: TASK_EXECUTOR}}
        const workerType = createWorkerType(TASK_EXECUTOR, orphaned, config({deployEnvironment: 'PRODUCTION'}))
        expect(() => workerType.images[0].containerName(orphaned)).toThrow(/session/i)
    })
})

describe('createWorkerType SANDBOX readiness', () => {
    it('waits only for sshd, not the on-demand servers', () => {
        const workerType = createWorkerType(
            SANDBOX,
            {...instance, reservation: {username: 'admin', workerType: SANDBOX}},
            config({deployEnvironment: 'PRODUCTION'}),
            'api-key'
        )
        const [image] = workerType.images
        expect(image.waitCommand).toEqual(['/script/wait_until_initialized.sh', '22'])
        // Routing is unchanged — only readiness narrows.
        expect(image.exposedPorts).toEqual([22, 8787, 3838, 8888])
        expect(image.publishedPorts).toEqual({222: 22, 8787: 8787, 3838: 3838, 8888: 8888})
    })
})

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

const {createWorkerType, TASK_EXECUTOR} = await import('./workerTypes.js')

const instance = {
    id: '3f2b8c1a-9d44-4e21-8f77-2c6a5b0e91d3',
    reservation: {username: 'admin', workerType: TASK_EXECUTOR},
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
    it('is "{image}.{username}.{id}"', () => {
        const workerType = createWorkerType(TASK_EXECUTOR, instance, config({deployEnvironment: 'PRODUCTION'}))
        expect(workerType.images[0].containerName(instance)).toBe(`task.admin.${instance.id}`)

        const localInstance = {...instance, host: instance.id, daemonHost: 'host.docker.internal'}
        const localWorkerType = createWorkerType(TASK_EXECUTOR, localInstance, config({deployEnvironment: 'DEV'}))
        expect(localWorkerType.images[0].containerName(localInstance)).toBe(`task.admin.${instance.id}`)
    })

    it('passes AWS EC2 instance ids through unchanged', () => {
        const awsInstance = {...instance, id: 'i-0abc123'}
        const workerType = createWorkerType(TASK_EXECUTOR, awsInstance, config({deployEnvironment: 'PRODUCTION'}))
        expect(workerType.images[0].containerName(awsInstance)).toBe('task.admin.i-0abc123')
    })
})

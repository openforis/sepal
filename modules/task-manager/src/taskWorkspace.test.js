import {chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {configureNoLogging} from '#sepal/log'

import {createTask, State} from './task.js'
import {TaskWorkspace} from './taskWorkspace.js'

let root
let dir
let stagingDir
let workspace
const TASK = createTask({id: 't-1', state: State.ACTIVE, username: 'alice', operation: 'image.GEE', params: {image: {scale: 30}}})
const DATA_TASK = createTask({id: 't-1', state: State.ACTIVE, username: 'alice', operation: 'image.DATA', params: {}})

beforeAll(() => configureNoLogging())

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'task-workspace-'))
    dir = join(root, 'tasks')
    stagingDir = join(root, 'staging')
    workspace = new TaskWorkspace({dir, stagingDir})
})

afterEach(async () => {
    await chmod(join(stagingDir, 't-1'), 0o700).catch(() => {})
    await rm(root, {recursive: true, force: true})
})

test('hands the container the task it runs', async () => {
    await workspace.prepare(TASK)

    expect(JSON.parse(await readFile(join(dir, 't-1', 'task.json'), 'utf8'))).toEqual({id: 't-1', operation: 'image.GEE', params: {image: {scale: 30}}})
})

test('reads the outcome the container left', async () => {
    await workspace.prepare(TASK)
    const result = {state: 'COMPLETED', statusDescription: {messageKey: 'tasks.status.completed', defaultMessage: 'Completed!'}}
    await writeFile(join(dir, 't-1', 'result.json'), JSON.stringify(result))

    expect(await workspace.readResult('t-1')).toEqual(result)
})

test('reads no outcome when the container left none, or an unreadable one', async () => {
    await workspace.prepare(TASK)
    expect(await workspace.readResult('t-1')).toBeNull()

    await writeFile(join(dir, 't-1', 'result.json'), '{"state":')
    expect(await workspace.readResult('t-1')).toBeNull()

    await writeFile(join(dir, 't-1', 'result.json'), JSON.stringify({state: 'BOGUS'}))
    expect(await workspace.readResult('t-1')).toBeNull()
})

test('removes the task directory, also when it is already gone', async () => {
    await workspace.prepare(TASK)

    await workspace.remove('t-1')
    await workspace.remove('t-1')

    expect(await present(join(dir, 't-1'))).toBe(false)
})

describe('staging', () => {
    test('an export to Data gets a staging folder of its own, closed to others', async () => {
        await workspace.prepare(DATA_TASK)

        const staging = await stat(join(stagingDir, 't-1'))
        expect(staging.isDirectory()).toBe(true)
        expect(staging.mode & 0o777).toBe(0o700)
    })

    test('other tasks get no staging folder', async () => {
        await workspace.prepare(TASK)

        expect(await present(join(stagingDir, 't-1'))).toBe(false)
    })

    test('the staging folder goes with the task directory, whatever it holds', async () => {
        await workspace.prepare(DATA_TASK)
        await mkdir(join(stagingDir, 't-1', 'nested'))
        await writeFile(join(stagingDir, 't-1', 'nested', 'a.tif'), 'a')

        await workspace.remove('t-1')

        expect(await present(join(stagingDir, 't-1'))).toBe(false)
        expect(await present(join(dir, 't-1'))).toBe(false)
    })

    test('a staging folder that cannot be removed does not keep the task directory', async () => {
        await workspace.prepare(DATA_TASK)
        await writeFile(join(stagingDir, 't-1', 'a.tif'), 'a')
        await chmod(join(stagingDir, 't-1'), 0o500)

        await workspace.remove('t-1')

        expect(await present(join(dir, 't-1'))).toBe(false)
    })
})

describe('leftovers', () => {
    test('removes the directories of every task but the given ones', async () => {
        for (const id of ['running', 'gone-1', 'gone-2']) {
            await workspace.prepare(createTask({...DATA_TASK, id}))
        }
        await workspace.prepare(createTask({...TASK, id: 'gone-3'}))

        await workspace.removeAllExcept(['running'])

        expect(await present(join(dir, 'running'))).toBe(true)
        expect(await present(join(stagingDir, 'running'))).toBe(true)
        for (const id of ['gone-1', 'gone-2', 'gone-3']) {
            expect(await present(join(dir, id))).toBe(false)
            expect(await present(join(stagingDir, id))).toBe(false)
        }
    })

    test('finds nothing to remove before any task ran', async () => {
        await expect(workspace.removeAllExcept([])).resolves.toBeUndefined()
    })
})

const present = path => stat(path).then(() => true, () => false)

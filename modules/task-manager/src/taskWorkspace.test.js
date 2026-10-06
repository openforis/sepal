import {mkdtemp, readFile, rm, stat, writeFile} from 'fs/promises'
import {tmpdir} from 'os'
import {join} from 'path'

import {createTask, State} from './task.js'
import {TaskWorkspace} from './taskWorkspace.js'

let dir
let workspace
const TASK = createTask({id: 't-1', state: State.ACTIVE, username: 'alice', operation: 'image.GEE', params: {image: {scale: 30}}})

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'task-workspace-'))
    workspace = new TaskWorkspace({dir})
})

afterEach(() => rm(dir, {recursive: true, force: true}))

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

    await expect(stat(join(dir, 't-1'))).rejects.toThrow()
})

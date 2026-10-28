import assert from 'node:assert/strict'
import {mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, test} from 'node:test'

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

    assert.deepEqual(
        JSON.parse(await readFile(join(dir, 't-1', 'task.json'), 'utf8')),
        {id: 't-1', operation: 'image.GEE', params: {image: {scale: 30}}}
    )
})

test('reads the outcome the container left', async () => {
    await workspace.prepare(TASK)
    const result = {state: 'COMPLETED', statusDescription: {messageKey: 'tasks.status.completed', defaultMessage: 'Completed!'}}
    await writeFile(join(dir, 't-1', 'result.json'), JSON.stringify(result))

    assert.deepEqual(await workspace.readResult('t-1'), result)
})

test('reads no outcome when the container left none, or an unreadable one', async () => {
    await workspace.prepare(TASK)
    assert.equal(await workspace.readResult('t-1'), null)

    await writeFile(join(dir, 't-1', 'result.json'), '{"state":')
    assert.equal(await workspace.readResult('t-1'), null)

    await writeFile(join(dir, 't-1', 'result.json'), JSON.stringify({state: 'BOGUS'}))
    assert.equal(await workspace.readResult('t-1'), null)
})

test('removes the task directory, also when it is already gone', async () => {
    await workspace.prepare(TASK)

    await workspace.remove('t-1')
    await workspace.remove('t-1')

    await assert.rejects(stat(join(dir, 't-1')))
})

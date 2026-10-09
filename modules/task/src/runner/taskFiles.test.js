import {mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {readTask, writeResult} from './taskFiles.js'

let dir

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'task-files-'))
})

afterEach(() => rm(dir, {recursive: true, force: true}))

test('reads the task task-manager handed over', async () => {
    await writeFile(join(dir, 'task.json'), JSON.stringify({id: 't-1', operation: 'image.GEE', params: {a: 1}}))

    expect(await readTask(dir)).toEqual({id: 't-1', operation: 'image.GEE', params: {a: 1}})
})

test('leaves the result complete or not at all', async () => {
    await writeResult(dir, {state: 'COMPLETED', statusDescription: {messageKey: 'k'}})

    expect(JSON.parse(await readFile(join(dir, 'result.json'), 'utf8'))).toEqual({state: 'COMPLETED', statusDescription: {messageKey: 'k'}})
    expect(await readdir(dir)).toEqual(['result.json'])
})

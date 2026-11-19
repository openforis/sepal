import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {mkdir, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, test} from 'node:test'
import {promisify} from 'node:util'

const exec = promisify(execFile)
let root
let script
let home

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'delete-credentials-'))
    home = join(root, 'alice')
    script = join(root, 'delete-credentials')
    const source = await readFile(new URL('../script/delete-credentials', import.meta.url), 'utf8')
    await writeFile(script, source.replace('/sepal/home', root))
})

afterEach(() => rm(root, {recursive: true, force: true}))

describe('credential deletion', () => {
    test('removes credentials from ordinary directories', async () => {
        const credentials = join(home, '.config/earthengine/credentials')
        await mkdir(join(home, '.config/earthengine'), {recursive: true})
        await writeFile(credentials, 'token')

        await exec('sh', [script, 'alice'])

        await assert.rejects(readFile(credentials), {code: 'ENOENT'})
    })

    test('treats missing homes and credential directories as already cleared', async () => {
        await exec('sh', [script, 'alice'])
        await mkdir(home)
        await exec('sh', [script, 'alice'])
        await mkdir(join(home, '.config'))
        await exec('sh', [script, 'alice'])
    })

    for (const component of ['.config', '.config/earthengine']) {
        test(`refuses a linked ${component} without removing its target credentials`, async () => {
            const target = join(home, 'target')
            await mkdir(join(target, component === '.config' ? 'earthengine' : ''), {recursive: true})
            if (component.includes('/')) await mkdir(join(home, '.config'))
            await symlink(target, join(home, component))
            const credentials = join(target, component === '.config' ? 'earthengine/credentials' : 'credentials')
            await writeFile(credentials, 'token')

            await assert.rejects(exec('sh', [script, 'alice']), error =>
                error.code === 4 && error.stderr.includes('must be a real directory'))

            assert.equal(await readFile(credentials, 'utf8'), 'token')
        })
    }

    test('reports an invalid non-directory component rather than claiming success', async () => {
        await mkdir(home)
        await writeFile(join(home, '.config'), 'invalid')

        await assert.rejects(exec('sh', [script, 'alice']))
    })
})

import {readFile, rename, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

export const readTask = async dir =>
    JSON.parse(await readFile(join(dir, 'task.json'), 'utf8'))

// task-manager may read result.json at any moment after the container exits; a rename makes it whole or absent.
export const writeResult = async (dir, result) => {
    const partial = join(dir, '.result.json')
    await writeFile(partial, JSON.stringify(result))
    await rename(partial, join(dir, 'result.json'))
}

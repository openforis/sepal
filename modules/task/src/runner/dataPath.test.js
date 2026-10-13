import {requireDataPath, requireWorkspacePath} from './dataPath.js'

describe('requireDataPath', () => {
    it.each([['exports/x', 'exports/x'], ['x/', 'x']])('accepts %p as %p', (path, expected) => {
        expect(requireDataPath(path)).toBe(expected)
    })

    it.each(['', '/x', 'a//b', 'a/./b', '../x', 'a\\b', 'a\0b'])('refuses %p with a user message', path => {
        const error = (() => { try { requireDataPath(path) } catch (e) { return e } })()

        expect(error.userMessage).toEqual(expect.objectContaining({key: 'tasks.data.invalidFolder', args: {path}}))
    })
})

describe('requireWorkspacePath', () => {
    it.each(['data', 'data/x', './data/x', '/data/x', 'x/../data', 'x/../data/y'])('refuses %p, inside the home\'s data folder', path => {
        const error = (() => { try { requireWorkspacePath(path) } catch (e) { return e } })()

        expect(error.userMessage).toEqual(expect.objectContaining({key: 'tasks.workspace.dataReserved'}))
    })

    it.each(['datax', 'x/data', 'data/../x', undefined, null, ''])('accepts %p', path => {
        expect(requireWorkspacePath(path)).toBe(path)
    })
})

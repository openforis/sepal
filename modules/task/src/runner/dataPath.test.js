import {isWorkspaceDataPath, requireDataPath} from './dataPath.js'

describe('requireDataPath', () => {
    it.each([['exports/x', 'exports/x'], ['x/', 'x']])('accepts %p as %p', (path, expected) => {
        expect(requireDataPath(path)).toBe(expected)
    })

    it.each(['', '/x', 'a//b', 'a/./b', '../x', 'a\\b', 'a\0b'])('refuses %p with a user message', path => {
        const error = (() => { try { requireDataPath(path) } catch (e) { return e } })()

        expect(error.userMessage).toEqual(expect.objectContaining({key: 'tasks.data.invalidFolder', args: {path}}))
    })
})

describe('isWorkspaceDataPath', () => {
    it.each(['data', 'data/x', './data/x', '/data/x', 'x/../data', 'x/../data/y'])('is true for %p', path => {
        expect(isWorkspaceDataPath(path)).toBe(true)
    })

    it.each(['datax', 'x/data', 'data/../x', undefined, null, ''])('is false for %p', path => {
        expect(isWorkspaceDataPath(path)).toBe(false)
    })
})

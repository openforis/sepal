import {describe, expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({
    msg: id => id
}))

const {exportOrigin, originName, originText, originType, taskTitle} = await import('./taskOrigin')

describe('exportOrigin', () => {
    it('is the origin an export carries', () => {
        const origin = {type: 'NOTEBOOK', path: 'module_results/2024/analysis.ipynb'}

        expect(exportOrigin(exportTaskInfo({origin}))).toEqual(origin)
    })

    it('places an export without an origin in the sandbox', () => {
        expect(exportOrigin(exportTaskInfo())).toEqual({type: 'SANDBOX'})
    })

    it('is absent for a recipe task', () => {
        expect(exportOrigin(recipeTaskInfo())).toBeNull()
    })

    it('is absent for a task without task info', () => {
        expect(exportOrigin(undefined)).toBeNull()
    })
})

describe('taskTitle', () => {
    it('names where an export came from, what it exported and where to', () => {
        const taskInfo = exportTaskInfo({origin: {type: 'NOTEBOOK', path: 'analysis.ipynb'}, kind: 'TABLE', destination: 'DRIVE'})

        expect(taskTitle(taskInfo)).toBe(
            'tasks.details.originNames.NOTEBOOK \u00b7 tasks.details.kindNames.TABLE \u2192 tasks.details.destination.DRIVE'
        )
    })

    it('names a recipe task by its recipe type', () => {
        expect(taskTitle(recipeTaskInfo())).toBe(
            'tasks.details.originNames.RECIPE \u00b7 tasks.details.recipeTypeNames.MOSAIC \u2192 tasks.details.destination.SEPAL'
        )
    })

    it('names an export of an unknown origin as from the sandbox', () => {
        expect(taskTitle(exportTaskInfo({origin: {type: 'SOMETHING_NEW'}}))).toBe(
            'tasks.details.originNames.SANDBOX \u00b7 tasks.details.kindNames.IMAGE \u2192 tasks.details.destination.SEPAL'
        )
    })

    it('is absent for a task without task info', () => {
        expect(taskTitle(undefined)).toBeNull()
    })
})

describe('originType', () => {
    it('names the kind of origin', () => {
        expect(originType({type: 'NOTEBOOK', path: 'analysis.ipynb'})).toBe('tasks.details.originNames.NOTEBOOK')
    })

    it('names an unknown kind of origin as the sandbox', () => {
        expect(originType({type: 'SOMETHING_NEW'})).toBe('tasks.details.originNames.SANDBOX')
    })
})

describe('originName', () => {
    it.each([
        ['a notebook in the home folder from ~', {type: 'NOTEBOOK', path: 'pysepal-api-exports.ipynb'}, '~/pysepal-api-exports.ipynb'],
        ['a script outside the home folder by its absolute path', {type: 'SCRIPT', path: '/opt/jobs/export.py'}, '/opt/jobs/export.py'],
        ['a sandbox working directory from ~', {type: 'SANDBOX', path: 'work'}, '~/work'],
        ['the home folder itself as ~', {type: 'SANDBOX', path: '.'}, '~'],
        ['a named app by its name', {type: 'APP', name: 'se.plan'}, 'se.plan']
    ])('shows %s', (_case, origin, expected) => {
        expect(originName(origin)).toBe(expected)
    })

    it.each([
        ['an app', {type: 'APP'}],
        ['the sandbox', {type: 'SANDBOX'}]
    ])('says the origin was not recorded for %s without a path or name', (_case, origin) => {
        expect(originName(origin)).toBe('tasks.details.originNotRecorded')
    })
})

describe('originText', () => {
    it.each([
        ['a notebook in the home folder from ~', {type: 'NOTEBOOK', path: 'pysepal-api-exports.ipynb'}, 'tasks.details.originNames.NOTEBOOK \u00b7 ~/pysepal-api-exports.ipynb'],
        ['a script in the home folder from ~', {type: 'SCRIPT', path: 'scripts/export.py'}, 'tasks.details.originNames.SCRIPT \u00b7 ~/scripts/export.py'],
        ['a script outside the home folder by its absolute path', {type: 'SCRIPT', path: '/opt/jobs/export.py'}, 'tasks.details.originNames.SCRIPT \u00b7 /opt/jobs/export.py'],
        ['a named app by type and name', {type: 'APP', name: 'se.plan'}, 'tasks.details.originNames.APP \u00b7 se.plan'],
        ['an unnamed app as not recorded', {type: 'APP'}, 'tasks.details.originNames.APP \u00b7 tasks.details.originNotRecorded'],
        ['the sandbox by its working directory', {type: 'SANDBOX', path: 'work'}, 'tasks.details.originNames.SANDBOX \u00b7 ~/work']
    ])('shows %s', (_case, origin, expected) => {
        expect(originText(origin)).toBe(expected)
    })
})

const exportTaskInfo = overrides => ({
    destination: 'SEPAL',
    outputPath: 'downloads/ndvi',
    source: 'pysepal-api',
    kind: 'IMAGE',
    ...overrides
})

const recipeTaskInfo = () => ({
    recipeType: 'MOSAIC',
    projectId: 'project-1',
    destination: 'SEPAL',
    outputPath: 'downloads/mosaic'
})

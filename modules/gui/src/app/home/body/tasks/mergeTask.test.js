import {describe, expect, it} from 'vitest'

import {isTaskRunning, mergeTask} from './mergeTask'

const loadedTask = {
    id: 't1',
    name: 'Export',
    description: 'My recipe',
    status: 'ACTIVE',
    statusDescription: '{"messageKey":"tasks.status.executing"}',
    creationTime: '2026-01-01T00:00:00Z',
    updateTime: '2026-01-01T00:01:00Z',
    params: {taskInfo: {destination: 'GEE', outputPath: 'users/x/asset'}}
}

describe('mergeTask', () => {
    it('returns the loaded task unchanged when there is no live task', () => {
        expect(mergeTask(loadedTask, undefined)).toBe(loadedTask)
    })

    it('returns null/undefined when nothing is loaded yet', () => {
        expect(mergeTask(null, {id: 't1', status: 'ACTIVE'})).toBeNull()
    })

    it('overrides only status, statusDescription and updateTime from the live task', () => {
        const liveTask = {
            id: 't1',
            status: 'FAILED',
            statusDescription: '{"messageKey":"tasks.status.failedGeneric"}',
            updateTime: '2026-01-01T00:05:00Z'
        }
        expect(mergeTask(loadedTask, liveTask)).toEqual({
            ...loadedTask,
            status: 'FAILED',
            statusDescription: '{"messageKey":"tasks.status.failedGeneric"}',
            updateTime: '2026-01-01T00:05:00Z'
        })
    })

    it('does not clobber loaded params/name/description/creationTime', () => {
        const merged = mergeTask(loadedTask, {id: 't1', status: 'COMPLETED'})
        expect(merged.params).toBe(loadedTask.params)
        expect(merged.name).toBe('Export')
        expect(merged.description).toBe('My recipe')
        expect(merged.creationTime).toBe('2026-01-01T00:00:00Z')
        expect(merged.status).toBe('COMPLETED')
    })

    it('does not overwrite loaded live fields with undefined live values', () => {
        const merged = mergeTask(loadedTask, {id: 't1', status: 'COMPLETED'}) // no statusDescription/updateTime
        expect(merged.statusDescription).toBe(loadedTask.statusDescription)
        expect(merged.updateTime).toBe(loadedTask.updateTime)
    })
})

describe('isTaskRunning', () => {
    it('is true for ACTIVE/PENDING/CANCELING', () => {
        expect(isTaskRunning({status: 'ACTIVE'})).toBe(true)
        expect(isTaskRunning({status: 'PENDING'})).toBe(true)
        expect(isTaskRunning({status: 'CANCELING'})).toBe(true)
    })

    it('is false for terminal states and missing tasks', () => {
        expect(isTaskRunning({status: 'COMPLETED'})).toBe(false)
        expect(isTaskRunning({status: 'FAILED'})).toBe(false)
        expect(isTaskRunning({status: 'CANCELED'})).toBe(false)
        expect(isTaskRunning(null)).toBe(false)
    })
})

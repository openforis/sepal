import {describe, expect, it} from 'vitest'

import {updateTimeLabelKey} from './taskLabels'

describe('updateTimeLabelKey', () => {
    it('maps running statuses to "last progress"', () => {
        expect(updateTimeLabelKey('PENDING')).toBe('tasks.details.updateTime.lastProgress')
        expect(updateTimeLabelKey('ACTIVE')).toBe('tasks.details.updateTime.lastProgress')
    })

    it('maps CANCELING to "cancel requested"', () => {
        expect(updateTimeLabelKey('CANCELING')).toBe('tasks.details.updateTime.cancelRequested')
    })

    it('maps terminal statuses to their outcome label', () => {
        expect(updateTimeLabelKey('COMPLETED')).toBe('tasks.details.updateTime.completed')
        expect(updateTimeLabelKey('FAILED')).toBe('tasks.details.updateTime.failed')
        expect(updateTimeLabelKey('CANCELED')).toBe('tasks.details.updateTime.canceled')
    })

    it('falls back to "last update" for unknown/missing status', () => {
        expect(updateTimeLabelKey('SOMETHING_ELSE')).toBe('tasks.details.updateTime.lastUpdate')
        expect(updateTimeLabelKey(undefined)).toBe('tasks.details.updateTime.lastUpdate')
    })
})

import {describe, expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({msg: id => id}))
vi.mock('~/widget/legend/legend', () => ({Legend: () => null}))

import {BandSpec} from './bandSpec'

describe('BandSpec', () => {
    it('shows the band name and type on the same line', () => {
        const bandSpec = new BandSpec({
            bands: {red: {}},
            spec: {id: 'red-id', name: 'red', type: 'continuous'},
            selected: false,
            onClick: vi.fn(),
            onRemove: vi.fn(),
            onUpdate: vi.fn()
        })

        const item = bandSpec.render().props.children

        expect(item.props.title).toBe('red')
        expect(item.props.metadata).toEqual([
            'process.panels.inputImagery.form.type',
            'continuous'
        ])
        expect(item.props.description).toBeUndefined()
    })
})

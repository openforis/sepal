import {isAoiSuppressed} from './aoiLayer'

const editing = {ui: {aoi: {editing: true}}}
const idle = {ui: {}}
const ownAoi = {aoi: {type: 'POLYGON', path: [[10, 20], [30, 20], [30, 40]]}}

describe('isAoiSuppressed', () => {
    it('suppresses the applied aoi while a polygon is being edited', () => {
        expect(isAoiSuppressed({layerConfig: {}, recipe: editing})).toBe(true)
    })

    it('keeps rendering a layer given an aoi of its own, so the preview map survives', () => {
        expect(isAoiSuppressed({layerConfig: ownAoi, recipe: editing})).toBe(false)
    })

    it('renders normally when nothing is being edited', () => {
        expect(isAoiSuppressed({layerConfig: {}, recipe: idle})).toBe(false)
    })

    it('renders normally when the recipe carries no ui state at all', () => {
        expect(isAoiSuppressed({layerConfig: {}, recipe: {}})).toBe(false)
    })

    it('defaults a missing layerConfig to no aoi of its own', () => {
        expect(isAoiSuppressed({recipe: editing})).toBe(true)
    })
})

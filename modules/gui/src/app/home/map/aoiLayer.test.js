import {hasAoiGeometry} from './aoiGeometryLayer'
import {aoiRenderStyle, DEFAULT_AOI_STYLE, isAoiSuppressed, resolveAoiStyle, withAlpha, withUpdatedAoiOpacity, withUpdatedAoiRenderSettings} from './aoiLayer'

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

describe('hasAoiGeometry', () => {
    it('accepts a drawn polygon', () => {
        expect(hasAoiGeometry({type: 'POLYGON', path: [[10, 20], [30, 20], [30, 40]]})).toBe(true)
    })

    it('accepts a referenced asset or recipe', () => {
        expect(hasAoiGeometry({type: 'ASSET', id: 'some/asset'})).toBe(true)
        expect(hasAoiGeometry({type: 'RECIPE', id: 'some-recipe'})).toBe(true)
    })

    it('rejects an aoi with neither a reference nor a path', () => {
        expect(hasAoiGeometry({type: 'POLYGON'})).toBe(false)
        expect(hasAoiGeometry({type: 'POLYGON', path: []})).toBe(false)
        expect(hasAoiGeometry({type: 'ASSET'})).toBe(false)
        expect(hasAoiGeometry(undefined)).toBe(false)
    })
})

// The alpha the map actually shows: the server colour's own alpha, scaled by the client-side whole-layer
// opacity that the tile overlay applies.
const effectiveAlpha = (color, opacity) => Math.round(parseInt(color.slice(7, 9) || 'FF', 16) * opacity)

describe('resolveAoiStyle', () => {
    it('defaults to the appearance aoi overlays already have', () => {
        expect(resolveAoiStyle()).toEqual({color: '#FFFFFF', width: 2, fillOpacity: 0.1, opacity: 80 / 255})
    })

    it('reproduces the previous hard-coded outline and fill once whole-layer opacity is applied', () => {
        const {color, fillColor, opacity} = aoiRenderStyle(resolveAoiStyle())
        expect(effectiveAlpha(color, opacity)).toBe(0x50)
        expect(effectiveAlpha(fillColor, opacity)).toBe(0x08)
    })

    it('lets a persisted style override any field and leaves the rest defaulted', () => {
        expect(resolveAoiStyle({style: {color: '#FF0000', width: 5}}))
            .toEqual({color: '#FF0000', width: 5, fillOpacity: 0.1, opacity: 80 / 255})
    })

    it('returns an independent style every time', () => {
        const style = resolveAoiStyle()
        expect(style).not.toBe(resolveAoiStyle())
        style.color = '#000000'
        expect(resolveAoiStyle().color).toBe('#FFFFFF')
        expect(DEFAULT_AOI_STYLE.color).toBe('#FFFFFF')
    })
})

describe('withUpdatedAoiOpacity', () => {
    it('replaces only the whole-layer opacity, preserving the rest', () => {
        expect(withUpdatedAoiOpacity({style: {color: '#FF0000', width: 5}}, 0.5))
            .toEqual({color: '#FF0000', width: 5, fillOpacity: 0.1, opacity: 0.5})
    })

    it('preserves the defaults for a layer that has no persisted style yet', () => {
        expect(withUpdatedAoiOpacity(undefined, 1)).toEqual({...DEFAULT_AOI_STYLE, opacity: 1})
    })
})

describe('withAlpha', () => {
    it('applies a relative alpha to a colour', () => {
        expect(withAlpha('#FFFFFF', 0.1)).toBe('#FFFFFF1A')
        expect(withAlpha('#FF0000', 0.5)).toBe('#FF000080')
        expect(withAlpha('#FFFFFF', 1)).toBe('#FFFFFFFF')
    })
})

describe('aoiRenderStyle', () => {
    it('sends the outline at full strength and the fill at its own opacity', () => {
        expect(aoiRenderStyle({color: '#FF0000', width: 5, fillOpacity: 0.5, opacity: 0.5}))
            .toEqual({color: '#FF0000', fillColor: '#FF000080', width: 5, opacity: 0.5})
    })

    // Whole-layer opacity is applied client-side to the mounted tiles. Encoding it into a server colour
    // as well would apply it twice, so neither colour may carry it.
    it('never encodes whole-layer opacity into a server colour', () => {
        const rendered = aoiRenderStyle({color: '#FF0000', width: 2, fillOpacity: 0.5, opacity: 0.5})
        expect(rendered.color).toBe('#FF0000')
        expect(rendered.color).not.toBe(withAlpha('#FF0000', 0.5))
        expect(rendered.fillColor).toBe(withAlpha('#FF0000', 0.5))
        expect(rendered.fillColor).not.toBe(withAlpha('#FF0000', 0.25))
    })
})

describe('withUpdatedAoiRenderSettings', () => {
    it('applies only the settings the options panel owns', () => {
        expect(withUpdatedAoiRenderSettings(
            {style: {color: '#FFFFFF', width: 2, fillOpacity: 0.1, opacity: 0.9}},
            {color: '#FF0000', width: 5, fillOpacity: 0.5}
        )).toEqual({color: '#FF0000', width: 5, fillOpacity: 0.5, opacity: 0.9})
    })

    // Opacity is the row's, not the modal's, so applying render settings must carry the persisted value
    // through instead of writing back the one the modal resolved.
    it('preserves the row-owned opacity when applying render settings', () => {
        expect(withUpdatedAoiRenderSettings({style: {opacity: 0.9}}, {color: '#FF0000', width: 5, fillOpacity: 0.5}).opacity)
            .toBe(0.9)
    })

    it('falls back to the default opacity for a layer that has none persisted', () => {
        expect(withUpdatedAoiRenderSettings(undefined, {color: '#FF0000', width: 5, fillOpacity: 0.5}).opacity)
            .toBe(80 / 255)
    })
})

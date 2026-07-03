import {DEFAULT_FEATURE_LAYER_STYLE, isFeatureLayerStyleValid, resolveFeatureLayerStyle, styleAfterColumnsLoaded} from './featureLayerStyle'

const sourceWithColumns = columns => ({sourceConfig: {columns}})

const style = overrides => ({...DEFAULT_FEATURE_LAYER_STYLE, ...overrides})

describe('resolveFeatureLayerStyle', () => {
    it('defaults to color-property mode when the schema has a color property and no per-area style', () => {
        const resolved = resolveFeatureLayerStyle({source: sourceWithColumns(['id', 'color', 'stratum'])})
        expect(resolved.colorMode).toBe('COLORS_FROM_PROPERTY')
        expect(resolved.colorProperty).toBe('color')
    })

    it('keeps ONE_COLOR when there is no color property', () => {
        expect(resolveFeatureLayerStyle({source: sourceWithColumns(['id', 'stratum'])}).colorMode).toBe('ONE_COLOR')
    })

    it('keeps ONE_COLOR when the source has no columns', () => {
        expect(resolveFeatureLayerStyle({source: {sourceConfig: {}}}).colorMode).toBe('ONE_COLOR')
        expect(resolveFeatureLayerStyle({}).colorMode).toBe('ONE_COLOR')
    })

    it('does not clobber an explicit per-area one-color style even when a color property exists', () => {
        const resolved = resolveFeatureLayerStyle({
            source: sourceWithColumns(['color']),
            layerConfig: {style: {colorMode: 'ONE_COLOR'}}
        })
        expect(resolved.colorMode).toBe('ONE_COLOR')
    })

    it('honors an explicit per-area color-mode choice', () => {
        const resolved = resolveFeatureLayerStyle({
            source: sourceWithColumns(['color']),
            layerConfig: {style: {colorMode: 'COLORS_BY_VALUE', valueProperty: 'stratum'}}
        })
        expect(resolved.colorMode).toBe('COLORS_BY_VALUE')
        expect(resolved.valueProperty).toBe('stratum')
    })

})

describe('styleAfterColumnsLoaded', () => {
    it('switches untouched one-color state to color-property mode when loaded columns include color', () => {
        const resolved = styleAfterColumnsLoaded({
            style: DEFAULT_FEATURE_LAYER_STYLE,
            source: {sourceConfig: {}},
            columns: ['id', 'color']
        })
        expect(resolved.colorMode).toBe('COLORS_FROM_PROPERTY')
        expect(resolved.colorProperty).toBe('color')
    })

    it('leaves untouched state as ONE_COLOR when loaded columns have no color', () => {
        const resolved = styleAfterColumnsLoaded({
            style: DEFAULT_FEATURE_LAYER_STYLE,
            source: {sourceConfig: {}},
            columns: ['id', 'stratum']
        })
        expect(resolved.colorMode).toBe('ONE_COLOR')
    })

    it('does not override an in-modal change (non-default mode)', () => {
        const current = {...DEFAULT_FEATURE_LAYER_STYLE, colorMode: 'COLORS_BY_VALUE'}
        expect(styleAfterColumnsLoaded({style: current, source: {sourceConfig: {}}, columns: ['color']})).toBe(current)
    })

    it('preserves an in-modal one-color edit made before columns loaded', () => {
        const current = {...DEFAULT_FEATURE_LAYER_STYLE, color: '#ff0000', width: 3}
        const resolved = styleAfterColumnsLoaded({style: current, source: {sourceConfig: {}}, columns: ['color']})
        expect(resolved).toBe(current)
        expect(resolved.colorMode).toBe('ONE_COLOR')
        expect(resolved.color).toBe('#ff0000')
    })

    it('does not override an explicit per-area style', () => {
        const layerConfig = {style: {colorMode: 'ONE_COLOR', color: '#123456'}}
        const source = {sourceConfig: {}}
        const resolved = styleAfterColumnsLoaded({
            style: resolveFeatureLayerStyle({layerConfig, source}),
            layerConfig,
            source,
            columns: ['color']
        })
        expect(resolved.colorMode).toBe('ONE_COLOR')
        expect(resolved.color).toBe('#123456')
    })
})

describe('isFeatureLayerStyleValid', () => {
    it('is valid for ONE_COLOR by default', () => {
        expect(isFeatureLayerStyleValid({style: style()})).toBe(true)
    })

    it('is invalid for COLORS_FROM_PROPERTY with a blank color property', () => {
        expect(isFeatureLayerStyleValid({style: style({colorMode: 'COLORS_FROM_PROPERTY', colorProperty: ''})})).toBe(false)
    })

    it('is valid for COLORS_FROM_PROPERTY with a color property', () => {
        expect(isFeatureLayerStyleValid({style: style({colorMode: 'COLORS_FROM_PROPERTY', colorProperty: 'color'})})).toBe(true)
    })

    it('is invalid for COLORS_BY_VALUE with no value property', () => {
        expect(isFeatureLayerStyleValid({
            style: style({colorMode: 'COLORS_BY_VALUE', valueProperty: ''}),
            entries: [{value: '1', color: '#000'}]
        })).toBe(false)
    })

    it('is invalid for COLORS_BY_VALUE with no entries', () => {
        expect(isFeatureLayerStyleValid({
            style: style({colorMode: 'COLORS_BY_VALUE', valueProperty: 'stratum'}),
            entries: []
        })).toBe(false)
    })

    it('is invalid for COLORS_BY_VALUE with a blank entry value', () => {
        expect(isFeatureLayerStyleValid({
            style: style({colorMode: 'COLORS_BY_VALUE', valueProperty: 'stratum'}),
            entries: [{value: '1', color: '#000'}, {value: '  ', color: '#111'}]
        })).toBe(false)
    })

    it('is valid for COLORS_BY_VALUE with a string value', () => {
        expect(isFeatureLayerStyleValid({
            style: style({colorMode: 'COLORS_BY_VALUE', valueProperty: 'class'}),
            entries: [{value: 'forest', color: '#0a0'}]
        })).toBe(true)
    })

    it('is invalid for COLORS_BY_VALUE with a blank value color', () => {
        expect(isFeatureLayerStyleValid({
            style: style({colorMode: 'COLORS_BY_VALUE', valueProperty: 'class'}),
            entries: [{value: 'forest', color: ''}]
        })).toBe(false)
    })

    it('is invalid for COLORS_BY_VALUE with an invalid value color', () => {
        expect(isFeatureLayerStyleValid({
            style: style({colorMode: 'COLORS_BY_VALUE', valueProperty: 'class'}),
            entries: [{value: 'forest', color: 'not-a-color'}]
        })).toBe(false)
    })
})

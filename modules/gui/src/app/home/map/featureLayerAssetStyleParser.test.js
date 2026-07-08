import {parseFeatureLayerAssetStyle} from './featureLayerAssetStyleParser'

describe('parseFeatureLayerAssetStyle', () => {
    it('parses stratum_class_values/palette/names into a COLORS_BY_VALUE style', () => {
        const style = parseFeatureLayerAssetStyle({
            properties: {
                stratum_class_values: '1,2,3',
                stratum_class_palette: '#ff0000,#00ff00,#0000ff',
                stratum_class_names: 'Forest,Water,Urban'
            },
            columns: ['id', 'stratum']
        })
        expect(style).toEqual({
            colorMode: 'COLORS_BY_VALUE',
            valueProperty: 'stratum',
            valueColors: {'1': '#FF0000', '2': '#00FF00', '3': '#0000FF'}
        })
    })

    it('works without the optional names', () => {
        const style = parseFeatureLayerAssetStyle({
            properties: {stratum_class_values: '1,2', stratum_class_palette: '#000,#fff'},
            columns: ['stratum']
        })
        expect(style.colorMode).toBe('COLORS_BY_VALUE')
        expect(style.valueProperty).toBe('stratum')
        expect(style.valueColors).toEqual({'1': '#000000', '2': '#FFFFFF'})
    })

    it('ignores metadata for a property not present in columns', () => {
        expect(parseFeatureLayerAssetStyle({
            properties: {stratum_class_values: '1,2', stratum_class_palette: '#000,#fff'},
            columns: ['id', 'color']
        })).toBeNull()
    })

    it('ignores a convention missing its palette or values', () => {
        expect(parseFeatureLayerAssetStyle({
            properties: {stratum_class_values: '1,2'},
            columns: ['stratum']
        })).toBeNull()
        expect(parseFeatureLayerAssetStyle({
            properties: {stratum_class_palette: '#000,#fff'},
            columns: ['stratum']
        })).toBeNull()
    })

    it('returns null when no value/color pair is valid', () => {
        expect(parseFeatureLayerAssetStyle({
            properties: {stratum_class_values: ' , ', stratum_class_palette: 'not-a-color,also-bad'},
            columns: ['stratum']
        })).toBeNull()
    })

    it('normalizes colors (short hex, bare hex, name) to full hex', () => {
        const style = parseFeatureLayerAssetStyle({
            properties: {stratum_class_values: '1,2,3', stratum_class_palette: '#0a0,0000ff,red'},
            columns: ['stratum']
        })
        expect(style.valueColors).toEqual({'1': '#00AA00', '2': '#0000FF', '3': '#FF0000'})
    })

    it('drops only the invalid pairs, keeping the valid ones', () => {
        const style = parseFeatureLayerAssetStyle({
            properties: {stratum_class_values: '1,2,3', stratum_class_palette: '#0a0,not-a-color,red'},
            columns: ['stratum']
        })
        expect(style.valueColors).toEqual({'1': '#00AA00', '3': '#FF0000'})
    })

    it('keeps string values as valueColors keys', () => {
        const style = parseFeatureLayerAssetStyle({
            properties: {class_class_values: 'forest,water', class_class_palette: '#0a0,#00f'},
            columns: ['class']
        })
        expect(style.valueProperty).toBe('class')
        expect(style.valueColors).toEqual({forest: '#00AA00', water: '#0000FF'})
    })

    it('decodes escaped commas in class values', () => {
        const style = parseFeatureLayerAssetStyle({
            properties: {label_class_values: 'a\\,b,c', label_class_palette: '#000,#fff'},
            columns: ['label']
        })
        expect(Object.keys(style.valueColors)).toEqual(['a,b', 'c'])
    })

    it('returns null for empty/omitted input', () => {
        expect(parseFeatureLayerAssetStyle({})).toBeNull()
        expect(parseFeatureLayerAssetStyle()).toBeNull()
    })

    it('picks the first column carrying a valid convention', () => {
        const style = parseFeatureLayerAssetStyle({
            properties: {
                stratum_class_values: '1,2',
                stratum_class_palette: '#000,#fff',
                zone_class_values: 'a,b',
                zone_class_palette: '#111,#222'
            },
            columns: ['zone', 'stratum']
        })
        expect(style.valueProperty).toBe('zone')
    })
})

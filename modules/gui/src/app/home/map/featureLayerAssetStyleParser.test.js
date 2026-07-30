import {parseFeatureLayerAssetStyle, parseFeatureLayerCategoricalProperties} from './featureLayerAssetStyleParser'

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

    it('keeps the default By-value style free of labels', () => {
        const style = parseFeatureLayerAssetStyle({
            properties: {
                stratum_class_values: '1,2',
                stratum_class_palette: '#ff0000,#00ff00',
                stratum_class_names: 'Forest,Water'
            },
            columns: ['stratum']
        })
        expect(style).toEqual({
            colorMode: 'COLORS_BY_VALUE',
            valueProperty: 'stratum',
            valueColors: {'1': '#FF0000', '2': '#00FF00'}
        })
        expect(JSON.stringify(style)).not.toContain('Forest')
    })
})

describe('parseFeatureLayerCategoricalProperties', () => {
    it('preserves ALL valid categorical properties (not just the first)', () => {
        const result = parseFeatureLayerCategoricalProperties({
            properties: {
                stratum_class_values: '1,2',
                stratum_class_palette: '#ff0000,#00ff00',
                zone_class_values: 'a,b',
                zone_class_palette: '#111111,#222222'
            },
            columns: ['stratum', 'zone']
        })
        expect(Object.keys(result)).toEqual(['stratum', 'zone'])
        expect(result.stratum).toEqual([{value: '1', color: '#FF0000'}, {value: '2', color: '#00FF00'}])
        expect(result.zone).toEqual([{value: 'a', color: '#111111'}, {value: 'b', color: '#222222'}])
    })

    it('preserves optional names aligned by index', () => {
        const result = parseFeatureLayerCategoricalProperties({
            properties: {
                stratum_class_values: '1,2,3',
                stratum_class_palette: '#ff0000,#00ff00,#0000ff',
                stratum_class_names: 'Forest,Water,Urban'
            },
            columns: ['stratum']
        })
        expect(result.stratum).toEqual([
            {value: '1', color: '#FF0000', label: 'Forest'},
            {value: '2', color: '#00FF00', label: 'Water'},
            {value: '3', color: '#0000FF', label: 'Urban'}
        ])
    })

    it('omits missing or blank names but keeps the category', () => {
        const result = parseFeatureLayerCategoricalProperties({
            properties: {
                stratum_class_values: '1,2,3',
                stratum_class_palette: '#ff0000,#00ff00,#0000ff',
                stratum_class_names: 'Forest,, '
            },
            columns: ['stratum']
        })
        expect(result.stratum).toEqual([
            {value: '1', color: '#FF0000', label: 'Forest'},
            {value: '2', color: '#00FF00'},
            {value: '3', color: '#0000FF'}
        ])
    })

    it('keeps a MIDDLE-blank name aligned to the right value (no shift)', () => {
        const result = parseFeatureLayerCategoricalProperties({
            properties: {
                stratum_class_values: '1,2,3',
                stratum_class_palette: '#ff0000,#00ff00,#0000ff',
                stratum_class_names: 'Forest,,Urban'
            },
            columns: ['stratum']
        })
        // The empty middle name must NOT shift 'Urban' onto value 2.
        expect(result.stratum).toEqual([
            {value: '1', color: '#FF0000', label: 'Forest'},
            {value: '2', color: '#00FF00'},
            {value: '3', color: '#0000FF', label: 'Urban'}
        ])
    })

    it('keeps a LEADING-blank name aligned by index', () => {
        const result = parseFeatureLayerCategoricalProperties({
            properties: {
                stratum_class_values: '1,2',
                stratum_class_palette: '#ff0000,#00ff00',
                stratum_class_names: ',Water'
            },
            columns: ['stratum']
        })
        expect(result.stratum).toEqual([
            {value: '1', color: '#FF0000'},
            {value: '2', color: '#00FF00', label: 'Water'}
        ])
    })

    it('keeps a TRAILING-blank name aligned by index', () => {
        const result = parseFeatureLayerCategoricalProperties({
            properties: {
                stratum_class_values: '1,2',
                stratum_class_palette: '#ff0000,#00ff00',
                stratum_class_names: 'Forest,'
            },
            columns: ['stratum']
        })
        expect(result.stratum).toEqual([
            {value: '1', color: '#FF0000', label: 'Forest'},
            {value: '2', color: '#00FF00'}
        ])
    })

    it('preserves empty POSITIONS in values/palette (a blank value drops only its own pair)', () => {
        const result = parseFeatureLayerCategoricalProperties({
            properties: {
                // Middle value blank: the third value/color/name must stay aligned.
                stratum_class_values: '1,,3',
                stratum_class_palette: '#ff0000,#00ff00,#0000ff',
                stratum_class_names: 'Forest,Water,Urban'
            },
            columns: ['stratum']
        })
        expect(result.stratum).toEqual([
            {value: '1', color: '#FF0000', label: 'Forest'},
            {value: '3', color: '#0000FF', label: 'Urban'}
        ])
    })

    it('preserves an empty PALETTE position (drops that pair, keeps alignment of the rest)', () => {
        const result = parseFeatureLayerCategoricalProperties({
            properties: {
                stratum_class_values: '1,2,3',
                stratum_class_palette: '#ff0000,,#0000ff',
                stratum_class_names: 'Forest,Water,Urban'
            },
            columns: ['stratum']
        })
        expect(result.stratum).toEqual([
            {value: '1', color: '#FF0000', label: 'Forest'},
            {value: '3', color: '#0000FF', label: 'Urban'}
        ])
    })

    it('works with no names at all', () => {
        const result = parseFeatureLayerCategoricalProperties({
            properties: {stratum_class_values: '1,2', stratum_class_palette: '#000,#fff'},
            columns: ['stratum']
        })
        expect(result.stratum).toEqual([{value: '1', color: '#000000'}, {value: '2', color: '#FFFFFF'}])
    })

    it('decodes escaped commas in both values and names', () => {
        const result = parseFeatureLayerCategoricalProperties({
            properties: {
                label_class_values: 'a\\,b,c',
                label_class_palette: '#000,#fff',
                label_class_names: 'Alpha\\, Bravo,Charlie'
            },
            columns: ['label']
        })
        expect(result.label).toEqual([
            {value: 'a,b', color: '#000000', label: 'Alpha, Bravo'},
            {value: 'c', color: '#FFFFFF', label: 'Charlie'}
        ])
    })

    it('drops only invalid-color pairs, keeping valid categories and their labels', () => {
        const result = parseFeatureLayerCategoricalProperties({
            properties: {
                stratum_class_values: '1,2,3',
                stratum_class_palette: '#0a0,not-a-color,red',
                stratum_class_names: 'Forest,Water,Urban'
            },
            columns: ['stratum']
        })
        expect(result.stratum).toEqual([
            {value: '1', color: '#00AA00', label: 'Forest'},
            {value: '3', color: '#FF0000', label: 'Urban'}
        ])
    })

    it('ignores metadata for properties not present in columns', () => {
        expect(parseFeatureLayerCategoricalProperties({
            properties: {stratum_class_values: '1,2', stratum_class_palette: '#000,#fff'},
            columns: ['id']
        })).toEqual({})
    })

    it('returns an empty object for empty/omitted input', () => {
        expect(parseFeatureLayerCategoricalProperties({})).toEqual({})
        expect(parseFeatureLayerCategoricalProperties()).toEqual({})
    })
})

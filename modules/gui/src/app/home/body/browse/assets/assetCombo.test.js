import {describe, expect, it, vi} from 'vitest'

// What AssetCombo hands its `onLoaded` callback after loading an asset's metadata.
//
// `/assetMetadata` returns both `bands` - full descriptors, `{id, data_type, crs, ...}` - and `bandNames`, the
// plain names. `toVisualizations` asks for names: it looks up `${band}_class_names` and friends, so a descriptor
// interpolates to `[object Object]_class_names` and no categorical visualization is ever found. Which of the two
// lists the caller passes is therefore the whole behaviour under test.
//
// `compose` is mocked to the identity so the exported component is the class itself. Nothing renders: `onLoaded`
// is called on an instance whose props are supplied, which is the state React would have given it.

vi.mock('~/compose', () => ({
    compose: Component => Component,
    composeHoC: () => Component => Component
}))

vi.mock('~/translate', () => ({
    msg: key => (Array.isArray(key) ? key.join('.') : key)
}))

const {AssetCombo} = await import('./assetCombo')

// The metadata shape `/assetMetadata` actually returns.
const metadataOf = ({bandNames, properties = {}}) => ({
    type: 'Image',
    id: 'users/me/my-asset',
    bandNames,
    bands: bandNames.map(id => ({
        id,
        data_type: {type: 'PixelType', precision: 'int', min: 0, max: 255},
        crs: 'EPSG:4326',
        crs_transform: [1, 0, 0, 0, 1, 0]
    })),
    properties
})

const classProperties = (band, {names = 'Forest,Water', values = '1,2', palette = 'green,blue'} = {}) => ({
    [`${band}_class_names`]: names,
    [`${band}_class_values`]: values,
    [`${band}_class_palette`]: palette
})

const loaded = metadata => {
    const payloads = []
    const instance = new AssetCombo({
        onLoaded: payload => payloads.push(payload),
        assets: {updateAsset: () => {}}
    })
    // The instance was never mounted, so it has no updater. onLoaded only clears its own loading flag.
    instance.setState = () => {}
    instance.onLoaded({id: metadata.id}, metadata)
    return payloads[0]
}

const visualizationsOf = metadata => loaded(metadata).visualizations

describe('categorical visualizations from class properties', () => {
    it('derives one from a band whose class properties are complete', () => {
        const visualizations = visualizationsOf(metadataOf({
            bandNames: ['class'],
            properties: classProperties('class')
        }))

        expect(visualizations).toEqual([{
            type: 'categorical',
            bands: ['class'],
            labels: ['Forest', 'Water'],
            values: [1, 2],
            min: [1],
            max: [2],
            palette: ['#008000', '#0000FF'],
            id: expect.any(String)
        }])
    })

    it('derives one per band, in the order the metadata lists them', () => {
        const visualizations = visualizationsOf(metadataOf({
            bandNames: ['cover', 'change'],
            properties: {...classProperties('change'), ...classProperties('cover')}
        }))

        expect(visualizations.map(({bands}) => bands[0])).toEqual(['cover', 'change'])
    })

    it('gives each of them the generated id the callers rely on', () => {
        const visualizations = visualizationsOf(metadataOf({
            bandNames: ['cover', 'change'],
            properties: {...classProperties('cover'), ...classProperties('change')}
        }))

        const ids = visualizations.map(({id}) => id)

        expect(ids.filter(id => typeof id === 'string')).toHaveLength(2)
        expect(new Set(ids).size).toBe(2)
    })

    it('ignores a band whose class properties are incomplete', () => {
        const {class_class_palette: _dropped, ...incomplete} = classProperties('class')

        expect(visualizationsOf(metadataOf({bandNames: ['class'], properties: incomplete}))).toEqual([])
    })

    it('ignores class properties for a band the asset does not have', () => {
        expect(visualizationsOf(metadataOf({
            bandNames: ['other'],
            properties: classProperties('class')
        }))).toEqual([])
    })
})

describe('serialized visualizations alongside them', () => {
    it('keeps deriving them, unchanged', () => {
        const visualizations = visualizationsOf(metadataOf({
            bandNames: ['ndvi'],
            properties: {
                visualization_0_type: 'continuous',
                visualization_0_bands: 'ndvi',
                visualization_0_min: '-10000',
                visualization_0_max: '10000',
                visualization_0_palette: '#000000,#FFFFFF'
            }
        }))

        expect(visualizations).toEqual([{
            type: 'continuous',
            bands: ['ndvi'],
            min: [-10000],
            max: [10000],
            palette: ['#000000', '#FFFFFF'],
            inverted: [false],
            id: expect.any(String)
        }])
    })

    it('puts the serialized ones before the class-property ones', () => {
        const visualizations = visualizationsOf(metadataOf({
            bandNames: ['class'],
            properties: {
                visualization_0_type: 'continuous',
                visualization_0_bands: 'class',
                visualization_0_name: 'raw',
                ...classProperties('class')
            }
        }))

        expect(visualizations.map(({type}) => type)).toEqual(['continuous', 'categorical'])
    })

    // The decoding committed in 4a4b65969.
    it('still decodes baseBands and escaped names', () => {
        const [visualization] = visualizationsOf(metadataOf({
            bandNames: ['red', 'green', 'blue'],
            properties: {
                visualization_0_type: 'rgb',
                visualization_0_bands: 'red,green,blue',
                visualization_0_baseBands: 'red,green,blue',
                visualization_0_name: 'red\\, green\\, blue'
            }
        }))

        expect(visualization.baseBands).toEqual(['red', 'green', 'blue'])
        expect(visualization.name).toBe('red, green, blue')
    })

    // The isolation committed in e91f7d813.
    it('still lets a valid class-property visualization survive a malformed serialized one', () => {
        const visualizations = visualizationsOf(metadataOf({
            bandNames: ['class'],
            properties: {
                visualization_0_type: 'continuous',
                visualization_0_min: '0',
                ...classProperties('class')
            }
        }))

        expect(visualizations.map(({type}) => type)).toEqual(['categorical'])
    })
})

describe('the rest of the callback payload', () => {
    it('reports the asset id and the metadata object it was given', () => {
        const metadata = metadataOf({bandNames: ['class'], properties: classProperties('class')})
        const payload = loaded(metadata)

        expect(payload.asset).toBe('users/me/my-asset')
        expect(payload.metadata).toBe(metadata)
    })

    it('leaves the band descriptors exactly as they arrived', () => {
        const metadata = metadataOf({bandNames: ['class'], properties: classProperties('class')})
        const descriptor = metadata.bands[0]
        const before = JSON.parse(JSON.stringify(metadata))

        loaded(metadata)

        expect(metadata.bands[0]).toBe(descriptor)
        expect(metadata).toEqual(before)
    })

    it('reports no visualizations for metadata that describes no bands', () => {
        const payload = loaded({type: 'ImageCollection', id: 'users/me/empty', properties: {}})

        expect(payload.visualizations).toBeUndefined()
    })

    it('reports no visualizations when canonical band names are absent', () => {
        const payload = loaded({
            type: 'Image',
            id: 'users/me/incomplete',
            bands: [{id: 'class'}],
            properties: classProperties('class')
        })

        expect(payload.visualizations).toBeUndefined()
    })
})

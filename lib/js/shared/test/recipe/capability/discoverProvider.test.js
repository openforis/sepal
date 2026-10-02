import {CCDC_SEGMENTS} from '#sepal/recipe/capability/ccdcSegments'
import {
    CYCLIC,
    discoverProvider,
    FOUND,
    MALFORMED,
    NOT_A_SOURCE,
    UNRESOLVED,
    UNSUPPORTED
} from '#sepal/recipe/capability/discoverProvider'

// Which record or asset a selected source stands for, and the way there, over records already held.

describe('discovering the producer of a selected source', () => {
    it('follows a preserving wrapper to the recipe producing it, recording the role it was followed through', () => {
        const records = held(maskingOver('ccdc-1'), ccdc('ccdc-1'))

        const {status, provider, chain} = discoverProvider(ref('masking-1'), records, CCDC_SEGMENTS)

        expect(status).toBe(FOUND)
        expect(provider.record.id).toBe('ccdc-1')
        expect(chain.map(({reference, role}) => [reference.id, role])).toEqual([['masking-1', 'PRIMARY_IMAGE']])
    })

    it('finds the asset an asset-backed producer names, which is where to look, not proof of what is there', () => {
        const mosaic = {id: 'asset-mosaic-1', type: 'ASSET_MOSAIC', model: {assetDetails: {assetId: 'users/x/segments'}}}

        const {status, provider} = discoverProvider(ref('masking-1'), held(maskingOver(mosaic.id), mosaic), CCDC_SEGMENTS)

        expect(status).toBe(FOUND)
        expect(provider.declared.segmentsAsset(provider.record.model)).toBe('users/x/segments')
    })

    it('finds a selected asset as itself', () => {
        expect(discoverProvider({type: 'ASSET', id: 'users/x/segments'}, held(), CCDC_SEGMENTS))
            .toEqual({status: FOUND, provider: {assetId: 'users/x/segments'}, chain: []})
    })

    it('stops at the record that neither produces nor preserves it, keeping the way there', () => {
        const mosaic = {id: 'mosaic-1', type: 'MOSAIC', model: {}}

        const {status, chain, at} = discoverProvider(ref('masking-1'), held(maskingOver(mosaic.id), mosaic), CCDC_SEGMENTS)

        expect(status).toBe(UNSUPPORTED)
        expect(chain.map(({reference}) => reference.id)).toEqual(['masking-1'])
        expect(at).toEqual({reference: ref('mosaic-1'), record: mosaic})
    })

    it('stops at a stack, which preserves no input', () => {
        const stack = {id: 'stack-1', type: 'STACK', model: {inputImagery: {images: [{...ref('ccdc-1'), imageId: 'i1'}]}}}

        expect(discoverProvider(ref('stack-1'), held(stack, ccdc('ccdc-1')), CCDC_SEGMENTS).status).toBe(UNSUPPORTED)
    })

    it('stops at a wrapper whose model does not fill the role it preserves, naming the role', () => {
        const unfilled = {id: 'masking-1', type: 'MASKING', model: {}}

        const {status, at} = discoverProvider(ref('masking-1'), held(unfilled), CCDC_SEGMENTS)

        expect(status).toBe(MALFORMED)
        expect(at.role).toBe('PRIMARY_IMAGE')
    })

    it('stops at a record it does not hold, which reading may decide', () => {
        const {status, chain, at} = discoverProvider(ref('masking-1'), held(maskingOver('ccdc-1')), CCDC_SEGMENTS)

        expect(status).toBe(UNRESOLVED)
        expect(chain.map(({reference}) => reference.id)).toEqual(['masking-1'])
        expect(at).toEqual({reference: ref('ccdc-1')})
    })

    it('stops at a reference reached twice', () => {
        const first = {id: 'masking-1', type: 'MASKING', model: {imageToMask: ref('masking-2')}}
        const second = {id: 'masking-2', type: 'MASKING', model: {imageToMask: ref('masking-1')}}

        expect(discoverProvider(ref('masking-1'), held(first, second), CCDC_SEGMENTS).status).toBe(CYCLIC)
    })

    it('finds nothing to follow in a selection that is not a reference', () => {
        expect(discoverProvider(null, held(), CCDC_SEGMENTS)).toEqual({status: NOT_A_SOURCE, chain: []})
    })
})

const ref = id => ({type: 'RECIPE_REF', id})

const ccdc = id => ({id, type: 'CCDC', model: {}})

const maskingOver = id => ({id: 'masking-1', type: 'MASKING', model: {imageToMask: ref(id)}})

const held = (...records) => new Map(records.map(record => [record.id, record]))

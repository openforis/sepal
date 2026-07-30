import {requiresTempAssets, retrieveCapabilityError} from '#sepal/recipe/samplingDesign/retrieveCapability'

const model = ({skip, arrangementStrategy}) => ({
    stratification: {skip},
    sampleArrangement: {arrangementStrategy}
})

describe('requiresTempAssets four-mode matrix', () => {
    it('is false only for unstratified Random', () => {
        expect(requiresTempAssets(model({skip: true, arrangementStrategy: 'RANDOM'}))).toBe(false)
    })

    it('is true for stratified Random and both Systematic modes', () => {
        expect(requiresTempAssets(model({skip: false, arrangementStrategy: 'RANDOM'}))).toBe(true)
        expect(requiresTempAssets(model({skip: true, arrangementStrategy: 'SYSTEMATIC'}))).toBe(true)
        expect(requiresTempAssets(model({skip: false, arrangementStrategy: 'SYSTEMATIC'}))).toBe(true)
    })

    it('recognizes both skip representations for unstratified Random', () => {
        expect(requiresTempAssets(model({skip: true, arrangementStrategy: 'RANDOM'}))).toBe(false)
        expect(requiresTempAssets(model({skip: [true], arrangementStrategy: 'RANDOM'}))).toBe(false)
    })

    it('treats false, [] and absent skip as stratified (temp assets required)', () => {
        expect(requiresTempAssets(model({skip: false, arrangementStrategy: 'RANDOM'}))).toBe(true)
        expect(requiresTempAssets(model({skip: [], arrangementStrategy: 'RANDOM'}))).toBe(true)
        expect(requiresTempAssets({sampleArrangement: {arrangementStrategy: 'RANDOM'}})).toBe(true)
    })
})

describe('retrieveCapabilityError', () => {
    const unstratifiedRandom = model({skip: true, arrangementStrategy: 'RANDOM'})
    const stratifiedRandom = model({skip: false, arrangementStrategy: 'RANDOM'})
    const unstratifiedSystematic = model({skip: true, arrangementStrategy: 'SYSTEMATIC'})
    const stratifiedSystematic = model({skip: false, arrangementStrategy: 'SYSTEMATIC'})

    it('never blocks unstratified Random - even for a service account with no roots', () => {
        expect(retrieveCapabilityError({model: unstratifiedRandom, googleAccount: false, assetRoots: undefined})).toBeNull()
        expect(retrieveCapabilityError({model: unstratifiedRandom, googleAccount: false, assetRoots: []})).toBeNull()
    })

    it('blocks every temp-asset design with no linked account', () => {
        for (const m of [stratifiedRandom, unstratifiedSystematic, stratifiedSystematic]) {
            expect(retrieveCapabilityError({model: m, googleAccount: false, assetRoots: undefined})).toEqual({code: 'noAccount'})
        }
    })

    it('allows a temp-asset design with a linked account and a loaded, non-empty root list', () => {
        expect(retrieveCapabilityError({model: stratifiedRandom, googleAccount: true, assetRoots: ['users/me']})).toBeNull()
        expect(retrieveCapabilityError({model: stratifiedSystematic, googleAccount: true, assetRoots: ['users/me']})).toBeNull()
    })

    it('blocks a temp-asset design when the linked account has a loaded empty root list', () => {
        expect(retrieveCapabilityError({model: stratifiedRandom, googleAccount: true, assetRoots: []})).toEqual({code: 'noAssetRoot'})
    })

    it('blocks a temp-asset design with a distinct pending state while roots are unresolved (not noAssetRoot)', () => {
        expect(retrieveCapabilityError({model: stratifiedRandom, googleAccount: true, assetRoots: undefined})).toEqual({code: 'pending'})
    })
})

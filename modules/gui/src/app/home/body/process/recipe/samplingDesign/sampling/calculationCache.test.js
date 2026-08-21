import {calculationCache} from './calculationCache'

const AOI = {type: 'EE_TABLE', id: 'countries/SDN'}
const OTHER_AOI = {type: 'EE_TABLE', id: 'countries/KEN'}

const key = band => ({stratification: {type: 'ASSET', id: 'users/x/strata'}, band, crs: 'EPSG:4326', scale: 30})
const result = area => [{stratum: 1, area}]

describe('calculationCache', () => {
    it('returns undefined for a key it has never seen', () => {
        expect(calculationCache().get({aoi: AOI, key: key('class')})).toBeUndefined()
    })

    // Keys are built fresh on every request, so identity comparison would miss every time and the cache
    // would never hit at all.
    it('returns the stored result for a structurally equal but distinct key', () => {
        const cache = calculationCache()
        cache.set({aoi: AOI, key: key('class'), result: result(300)})
        expect(cache.get({aoi: {...AOI}, key: key('class')})).toEqual(result(300))
    })

    it('keeps different keys independently retrievable', () => {
        const cache = calculationCache()
        cache.set({aoi: AOI, key: key('class'), result: result(300)})
        cache.set({aoi: AOI, key: key('other'), result: result(700)})
        expect(cache.get({aoi: AOI, key: key('class')})).toEqual(result(300))
        expect(cache.get({aoi: AOI, key: key('other')})).toEqual(result(700))
    })

    // A recalculation of the same request must leave one answer, not two - an implementation that appended
    // would keep returning whichever it happened to find first.
    it('replaces an equal key rather than storing a second entry for it', () => {
        const cache = calculationCache()
        cache.set({aoi: AOI, key: key('class'), result: result(300)})
        cache.set({aoi: AOI, key: key('class'), result: result(301)})
        expect(cache.get({aoi: AOI, key: key('class')})).toEqual(result(301))
        cache.set({aoi: AOI, key: key('class'), result: result(302)})
        expect(cache.get({aoi: AOI, key: key('class')})).toEqual(result(302))
    })

    // Areas and probabilities are computed over the AOI, so an entry from a different AOI is not a slower
    // answer to the same question - it is an answer to a different one.
    it('drops every entry when the AOI is structurally different', () => {
        const cache = calculationCache()
        cache.set({aoi: AOI, key: key('class'), result: result(300)})
        cache.set({aoi: AOI, key: key('other'), result: result(700)})
        expect(cache.get({aoi: OTHER_AOI, key: key('class')})).toBeUndefined()
        expect(cache.get({aoi: OTHER_AOI, key: key('other')})).toBeUndefined()
    })

    it('keeps entries when the AOI is a structurally equal copy', () => {
        const cache = calculationCache()
        cache.set({aoi: AOI, key: key('class'), result: result(300)})
        expect(cache.get({aoi: {...AOI}, key: key('class')})).toEqual(result(300))
    })

    // Cleared means gone. Holding entries per AOI instead of clearing them would resurrect an answer the
    // user has no reason to expect back.
    it('does not resurrect cleared entries when the original AOI returns', () => {
        const cache = calculationCache()
        cache.set({aoi: AOI, key: key('class'), result: result(300)})
        cache.get({aoi: OTHER_AOI, key: key('class')})
        expect(cache.get({aoi: AOI, key: key('class')})).toBeUndefined()
    })

    // The caller keeps a reference to the key it built and to the result it was handed. Storing either by
    // reference would let ordinary downstream work rewrite cache identity or corrupt a stored answer.
    it('is unaffected by mutation of a key or result the caller still holds', () => {
        const cache = calculationCache()
        const storedKey = key('class')
        const storedResult = result(300)
        cache.set({aoi: AOI, key: storedKey, result: storedResult})
        storedKey.band = 'mutated'
        storedResult[0].area = 999
        expect(cache.get({aoi: AOI, key: key('class')})).toEqual(result(300))
        expect(cache.get({aoi: AOI, key: key('mutated')})).toBeUndefined()
    })

    it('is unaffected by mutation of a result it handed out', () => {
        const cache = calculationCache()
        cache.set({aoi: AOI, key: key('class'), result: result(300)})
        cache.get({aoi: AOI, key: key('class')})[0].area = 999
        expect(cache.get({aoi: AOI, key: key('class')})).toEqual(result(300))
    })

    it('keeps the AOI scope isolated from later mutation of the AOI it was given', () => {
        const cache = calculationCache()
        const aoi = {...AOI}
        cache.set({aoi, key: key('class'), result: result(300)})
        aoi.id = 'countries/KEN'
        expect(cache.get({aoi: AOI, key: key('class')})).toEqual(result(300))
    })

    it('gives each cache its own entries', () => {
        const areaCache = calculationCache()
        const probabilityCache = calculationCache()
        areaCache.set({aoi: AOI, key: key('class'), result: result(300)})
        expect(probabilityCache.get({aoi: AOI, key: key('class')})).toBeUndefined()
    })
})

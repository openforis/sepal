import {firstValueFrom, tap} from 'rxjs'

// Keep the AOI conversion authority real so these tests exercise the production descriptor boundary.
const {toGeometry$} = await import('#sepal/ee/aoi')

const resolvedGeometry = {
    type() {
        return 'Polygon'
    }
}

describe('toGeometry$ with a runtime geometry aoi', () => {
    it('emits the exact Earth Engine geometry carried by the wrapper', async () => {
        expect(typeof resolvedGeometry.type).toBe('function')
        await expect(
            firstValueFrom(toGeometry$({type: 'GEOMETRY', geometry: resolvedGeometry}))
        ).resolves.toBe(resolvedGeometry)
    })

    it.each([
        ['absent', {type: 'GEOMETRY'}],
        ['null', {type: 'GEOMETRY', geometry: null}]
    ])('rejects a wrapper with %s geometry instead of emitting it', async (_case, aoi) => {
        const emitted = []

        await expect(
            firstValueFrom(toGeometry$(aoi).pipe(tap(value => emitted.push(value))))
        ).rejects.toThrow(/GEOMETRY.*requires.*geometry/i)

        expect(emitted).toEqual([])
    })

    it('keeps a raw Earth Engine-shaped geometry unsupported', async () => {
        const emitted = []

        await expect(
            firstValueFrom(toGeometry$(resolvedGeometry).pipe(tap(value => emitted.push(value))))
        ).rejects.toThrow(/Unsupported aoi type:/)

        expect(emitted).toEqual([])
    })
})

// ASSET_BOUNDS requires source-image context and must not be resolved as a standalone descriptor.
describe('toGeometry$ with an ASSET_BOUNDS aoi', () => {
    it('fails explicitly instead of emitting anything', async () => {
        const aoi = {type: 'ASSET_BOUNDS'}
        const emitted = []

        await expect(
            firstValueFrom(toGeometry$(aoi).pipe(tap(value => emitted.push(value))))
        ).rejects.toThrow(/source.image context/i)

        expect(emitted).toEqual([])
    })

    it('still resolves the aoi types it does support', async () => {
        expect(await firstValueFrom(toGeometry$(null))).toBe(null)
    })
})

describe('toGeometry$ with an unrecognised aoi', () => {
    it('rejects the descriptor instead of passing it through as a geometry', async () => {
        const aoi = {type: 'SOMETHING_NEW'}
        const emitted = []

        await expect(
            firstValueFrom(toGeometry$(aoi).pipe(tap(value => emitted.push(value))))
        ).rejects.toThrow(/SOMETHING_NEW/)

        expect(emitted).toEqual([])
    })
})

import {firstValueFrom, tap} from 'rxjs'

// The real seam, deliberately unmocked: ASSET_BOUNDS means "whatever the source image covers", which
// cannot be known without the source image. Resolving it here would either hand Earth Engine the
// descriptor or quietly substitute null, and both have already cost us a production failure.
const {toGeometry$} = await import('#sepal/ee/aoi')

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

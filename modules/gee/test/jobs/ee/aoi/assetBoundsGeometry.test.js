import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

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
        assert.equal(typeof resolvedGeometry.type, 'function')
        assert.equal(
            await firstValueFrom(toGeometry$({type: 'GEOMETRY', geometry: resolvedGeometry})),
            resolvedGeometry
        )
    })

    for (const [scenario, aoi] of [
        ['absent', {type: 'GEOMETRY'}],
        ['null', {type: 'GEOMETRY', geometry: null}]
    ]) {
        it(
            `rejects a wrapper with ${scenario} geometry instead of emitting it`,
            async () => {
                const emitted = []

                await assert.rejects(
                    firstValueFrom(toGeometry$(aoi).pipe(tap(value => emitted.push(value)))),
                    /GEOMETRY.*requires.*geometry/i
                )

                assert.deepEqual(emitted, [])
            }
        )
    }

    it('keeps a raw Earth Engine-shaped geometry unsupported', async () => {
        const emitted = []

        await assert.rejects(
            firstValueFrom(toGeometry$(resolvedGeometry).pipe(tap(value => emitted.push(value)))),
            /Unsupported aoi type:/
        )

        assert.deepEqual(emitted, [])
    })
})

// ASSET_BOUNDS requires source-image context and must not be resolved as a standalone descriptor.
describe('toGeometry$ with an ASSET_BOUNDS aoi', () => {
    it('fails explicitly instead of emitting anything', async () => {
        const aoi = {type: 'ASSET_BOUNDS'}
        const emitted = []

        await assert.rejects(
            firstValueFrom(toGeometry$(aoi).pipe(tap(value => emitted.push(value)))),
            /source.image context/i
        )

        assert.deepEqual(emitted, [])
    })

    it('still resolves the aoi types it does support', async () => {
        assert.equal(await firstValueFrom(toGeometry$(null)), null)
    })
})

describe('toGeometry$ with an unrecognised aoi', () => {
    it('rejects the descriptor instead of passing it through as a geometry', async () => {
        const aoi = {type: 'SOMETHING_NEW'}
        const emitted = []

        await assert.rejects(
            firstValueFrom(toGeometry$(aoi).pipe(tap(value => emitted.push(value)))),
            /SOMETHING_NEW/
        )

        assert.deepEqual(emitted, [])
    })
})

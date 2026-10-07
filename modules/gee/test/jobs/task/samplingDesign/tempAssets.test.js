import {jest} from '@jest/globals'
import {lastValueFrom, of} from 'rxjs'

jest.unstable_mockModule('#sepal/ee/ee', () => ({
    default: {listBuckets$: () => of({assets: [{id: 'projects/alice/assets'}]})}
}))

const {isTempAssetId, tempAssetPrefix$} = await import('#gee/jobs/task/samplingDesign/tempAssets')

test('a GEE destination\'s temp assets sit beside the requested asset', async () => {
    expect(await lastValueFrom(tempAssetPrefix$({assetId: 'projects/alice/assets/samples'})))
        .toMatch(/^projects\/alice\/assets\/samples_tmp_\d{17}$/)
})

test('a SEPAL destination\'s temp assets sit in the user\'s first asset root, uniquely named', async () => {
    const first = await lastValueFrom(tempAssetPrefix$({}))
    const second = await lastValueFrom(tempAssetPrefix$({}))

    expect(first).toMatch(/^projects\/alice\/assets\/sampling_design_tmp_\d{17}_[0-9a-f]{6}$/)
    expect(first).not.toBe(second)
})

test('only ids carrying a temp marker count as temp assets', () => {
    expect(isTempAssetId('projects/alice/assets/samples_tmp_20261007101010101_candidates')).toBe(true)
    expect(isTempAssetId('projects/alice/assets/sampling_design_tmp_20261007101010101_a1b2c3_selected')).toBe(true)
    expect(isTempAssetId('projects/alice/assets/samples')).toBe(false)
    expect(isTempAssetId('projects/alice/assets/my_tmp_notes')).toBe(false)
})

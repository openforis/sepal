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

describe('isTempAssetId', () => {
    const prefixes = [
        'projects/alice/assets/samples_tmp_20261007101010101',
        'projects/alice/assets/sampling_design_tmp_20261007101010101_a1b2c3',
        'projects/alice/assets/sampling_design_tmp_20261007101010101'
    ]
    const suffixes = ['', '_candidates', '_additional_candidates', '_additional_candidates_2', '_selected']

    test.each(prefixes.flatMap(prefix => suffixes.map(suffix => prefix + suffix)))('%s is a generated temp asset', id => {
        expect(isTempAssetId(id)).toBe(true)
    })

    test.each([
        'projects/alice/assets/samples',
        'projects/alice/assets/my_tmp_notes',
        'projects/alice/assets/samples_tmp_20261007101010101_mydata',
        'projects/alice/assets/sampling_design_tmp_20261007101010101_zzzzzz',
        'projects/alice/assets/sampling_design_tmp_2026100710101010',
        'projects/alice/assets/samples_tmp_2026100710101010',
        'projects/alice/assets/samples_tmp_20261007101010101_selected_old',
        'projects/alice/assets/sampling_design_tmp_20261007101010101_a1b2c3_candidates_x',
        null
    ])('%s is not a temp asset', id => {
        expect(isTempAssetId(id)).toBe(false)
    })
})

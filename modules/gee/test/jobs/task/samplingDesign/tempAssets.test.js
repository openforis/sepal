import assert from 'node:assert/strict'
import {describe, mock, test} from 'node:test'

import {lastValueFrom, of} from 'rxjs'

mock.module('#sepal/ee/ee', {
    exports: {
        default: {listBuckets$: () => of({assets: [{id: 'projects/alice/assets'}]})}
    }
})

const {isTempAssetId, tempAssetPrefix$} = await import('#gee/jobs/task/samplingDesign/tempAssets')

test('a GEE destination\'s temp assets sit beside the requested asset', async () => {
    assert.match(
        await lastValueFrom(tempAssetPrefix$({assetId: 'projects/alice/assets/samples'})),
        /^projects\/alice\/assets\/samples_tmp_\d{17}$/
    )
})

test('a SEPAL destination\'s temp assets sit in the user\'s first asset root, uniquely named', async () => {
    const first = await lastValueFrom(tempAssetPrefix$({}))
    const second = await lastValueFrom(tempAssetPrefix$({}))

    assert.match(first, /^projects\/alice\/assets\/sampling_design_tmp_\d{17}_[0-9a-f]{6}$/)
    assert.notEqual(first, second)
})

describe('isTempAssetId', () => {
    const prefixes = [
        'projects/alice/assets/samples_tmp_20261007101010101',
        'projects/alice/assets/sampling_design_tmp_20261007101010101_a1b2c3',
        'projects/alice/assets/sampling_design_tmp_20261007101010101'
    ]
    const suffixes = ['', '_candidates', '_additional_candidates', '_additional_candidates_2', '_selected']

    for (const id of prefixes.flatMap(prefix => suffixes.map(suffix => prefix + suffix))) {
        test(`${id} is a generated temp asset`, () => {
            assert.equal(isTempAssetId(id), true)
        })
    }

    for (const id of [
        'projects/alice/assets/samples',
        'projects/alice/assets/my_tmp_notes',
        'projects/alice/assets/samples_tmp_20261007101010101_mydata',
        'projects/alice/assets/sampling_design_tmp_20261007101010101_zzzzzz',
        'projects/alice/assets/sampling_design_tmp_2026100710101010',
        'projects/alice/assets/samples_tmp_2026100710101010',
        'projects/alice/assets/samples_tmp_20261007101010101_selected_old',
        'projects/alice/assets/sampling_design_tmp_20261007101010101_a1b2c3_candidates_x',
        null
    ]) {
        test(`${id} is not a temp asset`, () => {
            assert.equal(isTempAssetId(id), false)
        })
    }
})

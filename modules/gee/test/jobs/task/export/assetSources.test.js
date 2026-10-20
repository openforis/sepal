import assert from 'node:assert/strict'
import {describe, it, mock} from 'node:test'

import {lastValueFrom, of} from 'rxjs'

// Which recipe output an image collection export is built from. The builders themselves are substituted.

mock.module('#gee/jobs/task/export/imageAssetExport', {
    exports: {
        imageAssetSource$: params => of({kind: 'image', params})
    }
})
mock.module('#gee/jobs/task/export/ccdcAssetExport', {
    exports: {
        ccdcAssetSource$: params => of({kind: 'ccdc', params})
    }
})

const {assetSource$} = await import('#gee/jobs/task/export/assetSources')

describe('the source of an asset export', () => {
    for (const [kind, params] of [
        ['image', {image: {recipe: {id: 'mosaic-1'}}}],
        ['ccdc', {image: {recipe: {id: 'ccdc-1'}}, description: 'segments'}]
    ]) {
        it(`is built by the ${kind} builder from the request`, async () => {
            assert.deepEqual(await lastValueFrom(assetSource$(kind, params)), {kind, params})
        })
    }

    for (const kind of ['timeSeries', 'constructor', undefined]) {
        it(`is refused for an unknown kind: ${kind}`, async () => {
            await assert.rejects(lastValueFrom(assetSource$(kind, {})), {statusCode: 400})
        })
    }
})

import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {lastValueFrom, of, throwError} from 'rxjs'

import {listRegressionAssets$} from '#gee/jobs/task/export/regressionCompatibility'
import ee from '#sepal/ee/ee'

// What a regression Resume finds in a collection, through the real ee extensions over a stand-in transport: every
// page Earth Engine answered, and a failure rather than an empty collection when a page cannot be read.

const COLLECTION = 'projects/p/assets/collection'

describe('listing the tiles a regression Resume would keep', () => {
    test('follows every page', async () => {
        const pages = {
            first: {nextPageToken: 'second', assets: [tile(0)]},
            second: {assets: [tile(1)]}
        }
        ee.setTransport({listAssetsPage$: (_parentId, pageToken) => of(pages[pageToken ?? 'first'])})

        const tiles = await lastValueFrom(listRegressionAssets$(COLLECTION))

        assert.deepEqual(tiles, [tile(0), tile(1)])
    })

    test('fails when a later page cannot be read', async () => {
        const refused = new Error('listing refused')
        ee.setTransport({
            listAssetsPage$: (_parentId, pageToken) => pageToken
                ? throwError(() => refused)
                : of({nextPageToken: 'second', assets: [tile(0)]})
        })

        await assert.rejects(lastValueFrom(listRegressionAssets$(COLLECTION)), refused)
    })
})

const tile = index => ({type: 'IMAGE', id: `${COLLECTION}/${index}`, name: `${COLLECTION}/${index}`})

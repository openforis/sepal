import {defer, EMPTY, lastValueFrom, of, throwError} from 'rxjs'

import ee from '#sepal/ee/ee'
import {createEEException} from '#sepal/ee/exception'

// What the extensions compose out of single requests - paging, folder paths, recursion - over whichever
// transport is installed.

const ROOT = 'projects/sepal-test-project/assets'

describe('listing assets', () => {
    test('follows every page and names the asset types', async () => {
        const pages = {
            first: {nextPageToken: 'second', assets: [{type: 'FOLDER', id: `${ROOT}/folder`, name: `${ROOT}/folder`, updateTime: 't1'}]},
            second: {assets: [{type: 'IMAGE', id: `${ROOT}/image`, name: `${ROOT}/image`, updateTime: 't2'}]}
        }
        ee.setTransport({listAssetsPage$: (_parentId, pageToken) => of(pages[pageToken ?? 'first'])})

        const assets = await lastValueFrom(ee.listAssets$(ROOT))

        expect(assets).toEqual([
            {type: 'Folder', id: `${ROOT}/folder`, name: `${ROOT}/folder`, updateTime: 't1'},
            {type: 'Image', id: `${ROOT}/image`, name: `${ROOT}/image`, updateTime: 't2'}
        ])
    })

    test('a folder that cannot be listed has no assets', async () => {
        const disabled = createEEException('Google Earth Engine API has not been enabled in project: alice-project', 'list assets')
        ee.setTransport({listAssetsPage$: () => throwError(() => disabled)})

        expect(await lastValueFrom(ee.listAssets$(ROOT))).toEqual([])
    })
})

test('creating a folder ensures every folder on its path, outermost first', async () => {
    const ensured = []
    ee.setTransport({
        ensureAssetFolder$: (parentId, assetId) => {
            ensured.push([parentId, assetId])
            return EMPTY
        }
    })

    await lastValueFrom(ee.createFolder$(`${ROOT}/a/b`), {defaultValue: null})

    expect(ensured).toEqual([[ROOT, 'a'], [ROOT, 'a/b']])
})

test('deleting a folder deletes what it holds before the folder', async () => {
    const deleted = []
    ee.setTransport({
        getAsset$: id => of({id, type: 'Folder'}),
        listAssetsPage$: parentId => of(parentId === `${ROOT}/folder`
            ? {assets: [{type: 'IMAGE', id: `${ROOT}/folder/image`}]}
            : {assets: []}),
        deleteAsset$: id => defer(() => {
            deleted.push(id)
            return of(undefined)
        })
    })

    await lastValueFrom(ee.deleteAssetRecursive$(`${ROOT}/folder`), {defaultValue: null})

    expect(deleted).toEqual([`${ROOT}/folder/image`, `${ROOT}/folder`])
})

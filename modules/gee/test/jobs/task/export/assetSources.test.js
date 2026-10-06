import {jest} from '@jest/globals'
import {lastValueFrom, of} from 'rxjs'

// Which recipe output an image collection export is built from. The builders themselves are substituted.

describe('the source of an asset export', () => {
    it.each([
        ['image', {image: {recipe: {id: 'mosaic-1'}}}],
        ['ccdc', {image: {recipe: {id: 'ccdc-1'}}, description: 'segments'}]
    ])('is built by the %s builder from the request', async (kind, params) => {
        expect(await lastValueFrom(assetSource$(kind, params))).toEqual({kind, params})
    })

    it.each(['timeSeries', 'constructor', undefined])('is refused for an unknown kind: %s', async kind => {
        await expect(lastValueFrom(assetSource$(kind, {}))).rejects.toMatchObject({statusCode: 400})
    })
})

jest.unstable_mockModule('#gee/jobs/task/export/imageAssetExport', () => ({
    imageAssetSource$: params => of({kind: 'image', params})
}))
jest.unstable_mockModule('#gee/jobs/task/export/ccdcAssetExport', () => ({
    ccdcAssetSource$: params => of({kind: 'ccdc', params})
}))

const {assetSource$} = await import('#gee/jobs/task/export/assetSources')

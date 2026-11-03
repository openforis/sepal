import {createHash} from 'node:crypto'
import Path from 'node:path'

import {catchError, concat, map, of, switchMap, throwError, toArray} from 'rxjs'

import ee from '#sepal/ee/ee'
import {ClientException} from '#sepal/exception'

export const PRECISION_PROPERTY = 'sepal_regression_precision'
export const SCHEMA_PROPERTY = 'sepal_regression_schema'

export const regressionCompatibility$ = (image, precision) => precision
    ? ee.getInfo$(ee.Dictionary({names: image.bandNames(), types: image.bandTypes()}), 'Read regression export schema').pipe(
        map(({names, types}) => ({
            precision,
            schema: schemaHash(names.map(name => [name, pixelType(types[name])]))
        }))
    )
    : of(null)

export const regressionProperties = compatibility => ({
    [PRECISION_PROPERTY]: compatibility?.precision || null,
    [SCHEMA_PROPERTY]: compatibility?.schema || null
})

export const readExportAsset$ = (assetId, compatibility, {allowAbsent = true, parentCollection} = {}) =>
    (compatibility ? ee.getAssetRecord$(assetId, 0) : ee.getAsset$(assetId, 0)).pipe(
        map(asset => ({...asset, type: ({IMAGE: 'Image', IMAGE_COLLECTION: 'ImageCollection'})[asset.type] || asset.type})),
        catchError(error => !compatibility
            ? of(null)
            : allowAbsent && error.eeStatusCode === 404
                ? confirmMissing$(assetId, compatibility, error, parentCollection)
                : throwError(() => regressionResumeError(assetId, 'Compatibility evidence could not be read', error)))
    )

// Unlike listAssets$, this listing never turns a failed page into an empty collection.
export const listRegressionAssets$ = assetId => {
    const page$ = pageToken => ee.listAssetsPage$(assetId, pageToken, 0).pipe(
        switchMap(({assets, nextPageToken}) => nextPageToken
            ? concat(of(assets), page$(nextPageToken))
            : of(assets))
    )
    return page$().pipe(toArray(), map(pages => pages.flat()))
}

export const assertRegressionCompatible = (assetId, asset, compatibility, {required = false, collection = false} = {}) => {
    if (!compatibility) {
        return
    }
    if (!asset && !required) {
        return
    }
    const properties = asset?.properties || {}
    if (!asset || properties[PRECISION_PROPERTY] !== compatibility.precision || properties[SCHEMA_PROPERTY] !== compatibility.schema) {
        throw regressionResumeError(assetId, 'Regression precision or schema is missing or incompatible')
    }
    if (collection && asset.type !== 'ImageCollection') {
        throw regressionResumeError(assetId, 'The destination is not an image collection')
    }
    if (asset.type === 'Image') {
        const schema = asset.bands?.map(({id, dataType}) => [id, pixelType(dataType && {
            precision: dataType.precision?.toLowerCase(),
            dimensions: dataType.dimensionsCount,
            ...dataType.range
        })])
        if (!schema || schemaHash(schema) !== compatibility.schema) {
            throw regressionResumeError(assetId, 'Retained tile band types are incompatible')
        }
    } else if (asset.type !== 'ImageCollection') {
        throw regressionResumeError(assetId, 'The destination is not an image collection')
    }
}

const confirmMissing$ = (assetId, compatibility, cause, parentCollection) => {
    if (parentCollection) {
        const matching = ee.ImageCollection(parentCollection)
            .filter(ee.Filter.eq('system:index', Path.basename(assetId)))
            .limit(1)
        return ee.getInfo$(matching.size(), 'Check regression destination tile').pipe(
            map(count => {
                if (count !== 0) {
                    throw cause
                }
                return null
            }),
            catchError(error => throwError(() => regressionResumeError(assetId, 'Could not establish that the destination tile is absent', error)))
        )
    }
    const parent = Path.dirname(cloudAssetId(assetId))
    return listRegressionAssets$(parent).pipe(
        map(assets => {
            if (assets.some(asset => cloudAssetId(asset.name || asset.id) === cloudAssetId(assetId))) {
                throw cause
            }
            return null
        }),
        catchError(error => error.eeStatusCode === 404 && !parent.endsWith('/assets')
            ? readExportAsset$(parent, compatibility).pipe(
                switchMap(asset => asset
                    ? throwError(() => regressionResumeError(assetId, 'Compatibility evidence could not be read', error))
                    : of(null))
            )
            : throwError(() => regressionResumeError(assetId, 'Could not establish that the destination is absent', error)))
    )
}

const pixelType = type => {
    if (!type || !['int', 'float', 'double'].includes(type.precision)
        || !Number.isInteger(type.dimensions ?? 0) || (type.dimensions ?? 0) < 0
        || type.precision === 'int' && (!Number.isFinite(type.min) || !Number.isFinite(type.max))) {
        throw new ClientException('Cannot establish regression export band types. Use a fresh destination or Replace.')
    }
    return {
        precision: type.precision,
        dimensions: type.dimensions ?? 0,
        ...(type.precision === 'int' && {min: type.min, max: type.max})
    }
}

const cloudAssetId = id => id.startsWith('users/') ? `projects/earthengine-legacy/assets/${id}` : id

const schemaHash = schema => createHash('sha256').update(JSON.stringify(schema)).digest('hex')

const regressionResumeError = (assetId, reason, cause) => {
    const message = `${reason} for ${assetId}. Resume cannot combine older and corrected regression results. Use a fresh destination or explicitly choose Replace; retry if the asset could not be read.`
    return new ClientException(message, {
        cause,
        userMessage: {
            message,
            key: 'tasks.ee.export.asset.regressionCompatibility',
            args: {assetId, reason}
        }
    })
}

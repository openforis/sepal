const {guiRequest$} = require('./guiRequest')

const createImageTools = () => [
    {
        name: 'image_bands',
        description: 'List bands of a RECIPE_REF or ASSET. Use before picking `band` for inputImage / inputImagery fields. Returns `{bands: string[], assetType?: "Image"|"ImageCollection"}` (assetType only when `type=ASSET`). Cheaper than recipe_load.',
        parameters: {
            type: 'object',
            properties: {
                type: {
                    enum: ['RECIPE_REF', 'ASSET'],
                    description: '`RECIPE_REF` = SEPAL recipe id. `ASSET` = EE asset id.'
                },
                id: {type: 'string', description: 'Recipe id or EE asset id (per `type`).'}
            },
            required: ['type', 'id']
        },
        handler$: ({params, request$}) =>
            guiRequest$(request$, 'image-bands', {type: params.type, id: params.id})
    },
    {
        name: 'image_visualizations',
        description: 'Preset visualizations for a RECIPE_REF or ASSET. Pass `band` to get its scalars: `bandMin`/`bandMax` (from first continuous entry) and `values`/`labels`/`palette` (from first categorical, if any). Missing scalars = no preset for that band; use schema-documented defaults. Omit `band` for unfiltered presets.',
        parameters: {
            type: 'object',
            properties: {
                type: {
                    enum: ['RECIPE_REF', 'ASSET'],
                    description: '`RECIPE_REF` = SEPAL recipe id. `ASSET` = EE asset id.'
                },
                id: {type: 'string', description: 'Recipe id or EE asset id (per `type`).'},
                band: {type: 'string', description: 'Optional. Filter to entries whose `bands` include this band.'}
            },
            required: ['type', 'id']
        },
        handler$: ({params, request$}) =>
            guiRequest$(request$, 'image-visualizations', {
                type: params.type,
                id: params.id,
                band: params.band
            })
    },
    {
        name: 'asset_metadata',
        description: 'Full EE metadata for an asset: `{type, bands, visualizations, properties, ...}`. Use for `asset` recipe `assetDetails` (Image vs ImageCollection switch + bands/vis/metadata) and for classChange ASSET inputs (probability-band detection). Heavier than image_bands — only when the full blob is needed.',
        parameters: {
            type: 'object',
            properties: {
                id: {type: 'string', description: 'EE asset id.'}
            },
            required: ['id']
        },
        handler$: ({params, request$}) =>
            guiRequest$(request$, 'asset-metadata', {id: params.id})
    }
]

module.exports = {createImageTools}

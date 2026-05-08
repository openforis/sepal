const {guiRequest} = require('./guiRequest')

const createImageTools = () => [
    {
        name: 'image_bands',
        description: 'List bands of an input image reference (`RECIPE_REF` or `ASSET`). Use before picking `band` for inputImage / inputImagery.images[] fields (indexChange, masking, classChange, stack, bandMath, remapping, classification). Returns `{bands: string[], assetType?: "Image"|"ImageCollection"}`. `assetType` only when `type=ASSET`. Cheaper than recipe_load when you only need band names.',
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
        handler: async ({params, request}) =>
            guiRequest(request, 'image-bands', {type: params.type, id: params.id})
    },
    {
        name: 'image_visualizations',
        description: 'Preset visualizations of an input image reference. Pass `band` to get scalars for that band: `bandMin`/`bandMax` (from first continuous entry) and `values`/`labels`/`palette` (from first categorical entry, if any). Returns `{visualizations[], bandMin?, bandMax?, values?, labels?, palette?}`. Missing scalars = no preset for that band; fall back to the schema-documented defaults (e.g. -10000/10000 for indexChange `bandMin`/`bandMax`). Omit `band` to get unfiltered presets.',
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
        handler: async ({params, request}) =>
            guiRequest(request, 'image-visualizations', {
                type: params.type,
                id: params.id,
                band: params.band
            })
    },
    {
        name: 'asset_metadata',
        description: 'Full EE metadata for an Image or ImageCollection asset: `{type: "Image"|"ImageCollection", bands: [{id, ...}], visualizations: [...], properties, ...}`. Use for `asset` recipe `assetDetails` (needs `type` to switch Image vs ImageCollection mode + full `bands`/`visualizations`/`metadata`) and for classChange `fromImage`/`toImage` ASSET inputs (needs the metadata blob the EE backend reads for probability-band detection). Heavier than `image_bands` — only use when the full blob is needed.',
        parameters: {
            type: 'object',
            properties: {
                id: {type: 'string', description: 'EE asset id.'}
            },
            required: ['id']
        },
        handler: async ({params, request}) =>
            guiRequest(request, 'asset-metadata', {id: params.id})
    }
]

module.exports = {createImageTools}

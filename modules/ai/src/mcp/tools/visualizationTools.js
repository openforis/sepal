const {guiRequest} = require('./guiRequest')
const {createVisParamsValidator} = require('../validation/visParamsValidator')

const VISUALIZATION_REQUEST_TIMEOUT_MS = 60000

const visParamsValidator = createVisParamsValidator()

const visParamsValidationError = errors => ({
    success: false,
    error: {
        code: 'VALIDATION_ERROR',
        message: `visParams validation failed:\n${errors.join('\n')}`
    }
})

const createVisualizationTools = () => [
    {
        name: 'recipe_visualizations',
        description: 'List visualizations available for an OPEN recipe. Returns `{recipeType, layout, groups, areas, bands?}`. `groups[*].options[*].visParams` are fully populated — pass straight to recipe_set_visualization. `areas`: area-key → currently-selected visParams. `bands` only present when `groups` is empty (ASSET_MOSAIC without STAC, BAND_MATH outputs) — then pick bands+mode and call recipe_propose_visualization.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'Recipe id (must be open).'}
            },
            required: ['recipeId']
        },
        handler: async ({params, request}) =>
            guiRequest(
                request,
                'list-visualizations',
                {recipeId: params.recipeId},
                {timeoutMs: VISUALIZATION_REQUEST_TIMEOUT_MS}
            )
    },
    {
        name: 'recipe_set_visualization',
        description: 'Apply a specific visualization to a map area. **Only when the user explicitly names one** (e.g. "show NDVI", "RGB", "categorical by class") OR when `recipe_visualizations.areas[area]` is null. Areas auto-select a default on source change — RESPECT it, do not override silently.\n\n**Named visualizations (RGB, IR/false-color, NDVI, NDMI, NBR, EVI, …) are band combinations on the open recipe — NOT separate datasets.** Find them in `recipe_visualizations.groups`; do not `asset_search` or `map_set_view` for them.\n\nWorkflow: recipe_visualizations FIRST → pass a matching `groups` entry verbatim. recipe_propose_visualization only when `groups` is empty or no preset fits. Hand-built = last resort. visParams shape by `type`: `rgb`/`hsv` need bands[3] + min[3] + max[3]; `continuous` needs bands[1] + min[1] + max[1] + palette[]; `categorical` needs bands[1] + values[] + labels[] + palette[] (one color per value).',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'Recipe id (must be open).'},
                area: {type: 'string', description: 'Map area key. See `Map areas` in `## Current Context` or recipe_visualizations.areas. Do NOT silently default to "center" when split.'},
                visParams: {
                    type: 'object',
                    description: 'Pass through an entry from recipe_visualizations or recipe_propose_visualization. Required fields per type listed in tool description.',
                    properties: {
                        type: {type: 'string', description: 'rgb / continuous / categorical / hsv.'},
                        bands: {type: 'array', items: {type: 'string'}, description: 'Band names. 1 for continuous/categorical; 3 for rgb/hsv.'},
                        min: {type: 'array', items: {type: 'number'}, description: 'rgb/hsv/continuous only.'},
                        max: {type: 'array', items: {type: 'number'}, description: 'rgb/hsv/continuous only.'},
                        gamma: {type: 'array', items: {type: 'number'}, description: 'Optional. rgb/hsv only.'},
                        palette: {type: 'array', items: {type: 'string'}, description: 'continuous and categorical. Categorical: one color per `values[]` entry.'},
                        inverted: {type: 'array', items: {type: 'boolean'}, description: 'Optional. continuous/rgb/hsv.'},
                        values: {type: 'array', items: {type: 'number'}, description: 'Categorical only. Discrete band values, ascending.'},
                        labels: {type: 'array', items: {type: 'string'}, description: 'Categorical only. One per `values[]` entry.'}
                    },
                    required: ['type', 'bands']
                }
            },
            required: ['recipeId', 'area', 'visParams']
        },
        handler: async ({params, request}) => {
            const errors = visParamsValidator.validate(params.visParams)
            if (errors.length) return visParamsValidationError(errors)
            return guiRequest(request, 'set-visualization', {
                recipeId: params.recipeId,
                area: params.area,
                visParams: params.visParams
            })
        }
    },
    {
        name: 'recipe_propose_visualization',
        description: 'Compute fully-formed visParams via percentile-stretch (or distinct-values for categorical) within the open recipe\'s AOI. Default target = the open recipe\'s own output; pass `imageSource` to target a foreign asset/recipe rendered in one of its areas.\n\nMode: `rgb` = 3 visible bands; `hsv` = 3-band rare; `continuous` = 1 band + palette (NDVI, slope, canopy_height); `categorical` = 1 discrete-integer band. Opaque names (B1..B5) → continuous on first band.\n\nReturns `{visParams}` ready for recipe_set_visualization.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'Recipe id (must be open). AOI comes from this recipe.'},
                mode: {
                    type: 'string',
                    enum: ['continuous', 'rgb', 'hsv', 'categorical']
                },
                bands: {
                    type: 'array',
                    items: {type: 'string'},
                    minItems: 1,
                    maxItems: 3,
                    description: 'Length 1 for continuous/categorical; 3 for rgb/hsv (order matters: R/G/B or H/S/V). Must exist on the target.'
                },
                palette: {
                    description: 'Optional continuous palette. Named (`ndvi`/`ndwi`/`nbr`/`vegetation`/`water`/`burn`/`rdylgn`/`rdylbu`/`viridis`/`magma`/`sequential`) or hex array. Ignored for rgb/hsv.'
                },
                imageSource: {
                    type: 'object',
                    description: 'Optional. Target a foreign source. AOI still comes from the open recipe.',
                    properties: {
                        type: {type: 'string', enum: ['ASSET', 'RECIPE_REF']},
                        id: {type: 'string', description: 'Asset path or recipe id.'}
                    },
                    required: ['type', 'id']
                }
            },
            required: ['recipeId', 'mode', 'bands'],
            allOf: [
                {
                    if: {properties: {mode: {const: 'rgb'}}, required: ['mode']},
                    then: {properties: {bands: {minItems: 3, maxItems: 3}}}
                },
                {
                    if: {properties: {mode: {const: 'hsv'}}, required: ['mode']},
                    then: {properties: {bands: {minItems: 3, maxItems: 3}}}
                },
                {
                    if: {properties: {mode: {const: 'continuous'}}, required: ['mode']},
                    then: {properties: {bands: {minItems: 1, maxItems: 1}}}
                },
                {
                    if: {properties: {mode: {const: 'categorical'}}, required: ['mode']},
                    then: {properties: {bands: {minItems: 1, maxItems: 1}}}
                }
            ]
        },
        handler: async ({params, request}) =>
            guiRequest(request, 'propose-visualization', params, {timeoutMs: VISUALIZATION_REQUEST_TIMEOUT_MS})
    }
]

module.exports = {createVisualizationTools}

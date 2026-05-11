const {guiRequest} = require('./guiRequest')

const VISUALIZATION_REQUEST_TIMEOUT_MS = 60000

const createVisualizationTools = () => [
    {
        name: 'recipe_visualizations',
        description: 'List visualizations currently available for an OPEN recipe. Browser computes from loaded state — reflects exact UI options (SR vs TOA, available bands, user-defined viz). Returns `{recipeType, groups, areas, bands?}`. `groups`: option groups `[{label, options:[{value, label, visParams}]}]`. `areas`: area-key → currently-selected visParams. `bands`: live band list, present ONLY when `groups` is empty (e.g. ASSET_MOSAIC without STAC, BAND_MATH outputs). When `bands` present + `groups` empty → pick bands+mode → call recipe_propose_visualization. visParams in `groups` are fully populated; pass straight to recipe_set_visualization. Single-pane layout = area key `"center"`; split layouts have multiple area keys.',
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
        description: 'Apply a visualization to a map area of an open recipe. visParams must be one returned by recipe_visualizations (or structurally compatible: type, bands, min, max, optional gamma/palette/inverted). Auto-saved; no separate save/reload.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'Recipe id (must be open).'},
                area: {type: 'string', description: 'Map area key. Single-pane = `"center"`. Split layouts have multiple areas (left/right, top/bottom, top-left/top-right/bottom-left/bottom-right). Read `Map areas` in `## Current Context` to see populated areas — when present, target the user\'s intended area; do NOT silently default to `"center"`. `recipe_visualizations` also returns the live area-key list.'},
                visParams: {
                    type: 'object',
                    description: 'Pass an entry from recipe_visualizations.',
                    properties: {
                        type: {type: 'string', description: 'rgb / continuous / categorical / hsv.'},
                        bands: {type: 'array', items: {type: 'string'}, description: 'Band names.'},
                        min: {type: 'array', items: {type: 'number'}},
                        max: {type: 'array', items: {type: 'number'}},
                        gamma: {type: 'array', items: {type: 'number'}},
                        palette: {type: 'array', items: {type: 'string'}},
                        inverted: {type: 'array', items: {type: 'boolean'}}
                    },
                    required: ['type', 'bands']
                }
            },
            required: ['recipeId', 'area', 'visParams']
        },
        handler: async ({params, request}) =>
            guiRequest(request, 'set-visualization', {
                recipeId: params.recipeId,
                area: params.area,
                visParams: params.visParams
            })
    },
    {
        name: 'recipe_propose_visualization',
        description: 'Compute fully-formed visParams for chosen bands+mode via histogram (or distinct-values for categorical) against current recipe state. Use after recipe_visualizations returns no `groups` but a `bands` list. Tool does percentile-stretch; you pick bands+mode.\n\nMode selection: rgb = 3 visible-light bands (R/G/B, B4/B3/B2); hsv = 3 bands as hue/sat/value composite (rare); continuous = 1 band with gradient (NDVI, slope, temperature, canopy_height, B1 alone); categorical = 1 band with discrete integers (`class`, often paired with `legend`). Opaque names (B1..B5) → default continuous on first band.\n\nReturns `{visParams}` ready for recipe_set_visualization.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'Recipe id (must be open).'},
                mode: {
                    type: 'string',
                    enum: ['continuous', 'rgb', 'hsv', 'categorical'],
                    description: 'continuous = 1-band stretched + palette; rgb/hsv = 3-band; categorical = discrete-value with palette per value.'
                },
                bands: {
                    type: 'array',
                    items: {type: 'string'},
                    description: 'Length 1 for continuous/categorical; 3 for rgb/hsv. Order matters (R/G/B or H/S/V).'
                },
                palette: {
                    description: 'Optional palette for continuous. Known name (`"ndvi"` / `"ndwi"` / `"nbr"` / `"vegetation"` / `"water"` / `"burn"` / `"rdylgn"` / `"rdylbu"` / `"viridis"` / `"magma"` / `"sequential"`) or hex array. Ignored for rgb/hsv. Default: sequential gray.'
                }
            },
            required: ['recipeId', 'mode', 'bands']
        },
        handler: async ({params, request}) =>
            guiRequest(request, 'propose-visualization', params, {timeoutMs: VISUALIZATION_REQUEST_TIMEOUT_MS})
    }
]

module.exports = {createVisualizationTools}

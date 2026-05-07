const {guiRequest} = require('./guiRequest')

const VISUALIZATION_REQUEST_TIMEOUT_MS = 60000

const createVisualizationTools = () => [
    {
        name: 'recipe_visualizations',
        description: 'List the band combinations (visualizations) currently available for an open recipe in the browser. The browser computes the list from the loaded recipe state, so it reflects exactly what the user can pick from in the UI — including state-dependent filtering (e.g. SR vs TOA, available bands, user-defined visualizations). Returns {recipeType, groups, areas, bands?}: groups is an array of option groups (each {label, options:[{value, label, visParams}]}); areas is a map of area-key -> currently-selected visParams; bands is the live band list, included only when groups is empty (e.g. ASSET_MOSAIC without STAC metadata, or BAND_MATH whose outputs have no preset visualizations). When bands is present and groups is empty, pick bands and a mode and call recipe_propose_visualization to assemble a visParams. Each visParams object in groups is fully populated and can be passed straight back to recipe_set_visualization. A typical single-pane layout uses the area key "center"; split layouts have multiple area keys. The recipe must be open in the browser.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'The recipe ID (must be open in the browser)'}
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
        description: 'Apply a band combination to a map area of an open recipe. The visParams object must be one of the entries returned by recipe_visualizations (or a structurally compatible object: type, bands, min, max, optional gamma/palette/inverted). The change is dispatched directly to the open recipe in the browser and is auto-saved by the GUI; no separate save or reload is needed. The recipe must be open in the browser.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'The recipe ID (must be open in the browser)'},
                area: {type: 'string', description: 'The map area key. Use "center" for a single-pane layout; use one of the area keys returned by recipe_visualizations for split layouts.'},
                visParams: {
                    type: 'object',
                    description: 'Visualization parameters — pass an entry from recipe_visualizations.',
                    properties: {
                        type: {type: 'string', description: 'Visualization type (e.g. rgb, continuous, categorical, hsv)'},
                        bands: {type: 'array', items: {type: 'string'}, description: 'Band names'},
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
        description: 'Compute a fully-formed visParams for the bands and mode you choose, by running a histogram (or distinct-values lookup for categorical) against the recipe in its current state. Use after recipe_visualizations comes back with no preset groups but a `bands` list — pick the bands and mode based on band names and chat context, this tool does the percentile-stretch math. Pick the mode based on band names and the user\'s intent: rgb when 3 bands form a familiar visible-light triple (R/G/B, B4/B3/B2, red/green/blue); hsv when 3 bands together form a hue/saturation/value composite (rare; phase/amplitude/residual); continuous when a single band has a meaningful gradient (NDVI, slope, temperature, canopy_height, B1 alone); categorical when the band has discrete integer values (a `class` band, often paired with a `legend`). When unsure on opaque names like B1..B5, default to continuous on the first band — the user can refine. Returns `{visParams: {...}}` ready to pass straight to recipe_set_visualization.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'The recipe ID. Must be open in the browser.'},
                mode: {
                    type: 'string',
                    enum: ['continuous', 'rgb', 'hsv', 'categorical'],
                    description: 'Visualization mode. continuous = single-band stretched + palette; rgb/hsv = three-band; categorical = discrete-value band with a palette per value.'
                },
                bands: {
                    type: 'array',
                    items: {type: 'string'},
                    description: 'Band names. Length 1 for continuous/categorical; length 3 for rgb/hsv. Order matters for rgb/hsv (red/green/blue or hue/saturation/value).'
                },
                palette: {
                    description: 'Optional palette for continuous mode. Either a known name (`"ndvi"`, `"ndwi"`, `"nbr"`, `"vegetation"`, `"water"`, `"burn"`, `"rdylgn"`, `"rdylbu"`, `"viridis"`, `"magma"`, `"sequential"`) or an explicit array of hex color strings. Ignored for rgb/hsv. Defaults to a sequential gray palette.'
                }
            },
            required: ['recipeId', 'mode', 'bands']
        },
        handler: async ({params, request}) =>
            guiRequest(request, 'propose-visualization', params, {timeoutMs: VISUALIZATION_REQUEST_TIMEOUT_MS})
    }
]

module.exports = {createVisualizationTools}

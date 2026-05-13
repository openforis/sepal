const {guiRequest$} = require('./guiRequest')

const SET_VIEW_TIMEOUT_MS = 60000

const sourceSchema = {
    type: 'object',
    description: 'Discriminated by `type`. `id` required for RECIPE_REF / ASSET.',
    properties: {
        type: {
            type: 'string',
            enum: ['CURRENT', 'RECIPE_REF', 'ASSET', 'GOOGLE_SATELLITE'],
            description: '`CURRENT` = the open recipe\'s own output. `RECIPE_REF` = another SEPAL recipe. `ASSET` = EE asset (metadata auto-fetched). `GOOGLE_SATELLITE` = basemap.'
        },
        id: {type: 'string', description: 'Recipe id (RECIPE_REF) or asset path (ASSET).'}
    },
    required: ['type'],
    allOf: [
        {
            if: {properties: {type: {const: 'RECIPE_REF'}}, required: ['type']},
            then: {required: ['id']}
        },
        {
            if: {properties: {type: {const: 'ASSET'}}, required: ['type']},
            then: {required: ['id']}
        }
    ]
}

const NAV_TIMEOUT_MS = 30000

const createMapTools = () => [
    {
        name: 'map_zoom_to_place',
        description: 'Geocode a place name and fit the map to its viewport. Use for "zoom to Tirana", "show me Albania", "go to the Amazon". Hits Google\'s Geocoder; ambiguous queries resolve to the first match. Returns `{bounds, place}` (the resolved formatted address).',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'Recipe id (must be open).'},
                query: {type: 'string', description: 'Place name (city, country, region, address).'}
            },
            required: ['recipeId', 'query']
        },
        handler$: ({params, request$}) =>
            guiRequest$(request$, 'zoom-to-place', {
                recipeId: params.recipeId,
                query: params.query
            }, {timeoutMs: NAV_TIMEOUT_MS})
    },
    {
        name: 'map_set_camera',
        description: 'Set the map center and/or zoom directly. At least one of `center` / `zoom` required. Use for "zoom in", "pan to X,Y", explicit coordinates. For place-name navigation use map_zoom_to_place.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'Recipe id (must be open).'},
                center: {
                    type: 'object',
                    description: 'Geographic center.',
                    properties: {
                        lat: {type: 'number', minimum: -90, maximum: 90},
                        lng: {type: 'number', minimum: -180, maximum: 180}
                    },
                    required: ['lat', 'lng']
                },
                zoom: {type: 'integer', minimum: 0, maximum: 22, description: 'Zoom level (0 = world, 22 = max detail). Typical: country 6–7, region 8–10, city 11–13, neighborhood 14+.'}
            },
            required: ['recipeId']
        },
        handler$: ({params, request$}) =>
            guiRequest$(request$, 'set-camera', {
                recipeId: params.recipeId,
                center: params.center,
                zoom: params.zoom
            })
    },
    {
        name: 'map_fit_bounds',
        description: 'Fit the map to a geographic envelope `[[swLng, swLat], [neLng, neLat]]`. Use when you have explicit bounds (e.g. from `## Current Context` Map view, or from an asset\'s known extent). For place names use map_zoom_to_place.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'Recipe id (must be open).'},
                bounds: {
                    type: 'array',
                    description: 'SW + NE corners as `[[swLng, swLat], [neLng, neLat]]`.',
                    items: {
                        type: 'array',
                        items: {type: 'number'},
                        minItems: 2,
                        maxItems: 2
                    },
                    minItems: 2,
                    maxItems: 2
                }
            },
            required: ['recipeId', 'bounds']
        },
        handler$: ({params, request$}) =>
            guiRequest$(request$, 'fit-bounds', {
                recipeId: params.recipeId,
                bounds: params.bounds
            })
    },
    {
        name: 'map_set_sync',
        description: 'Toggle synchronization across map panes in multi-pane layouts. When linked (default), pan/zoom on one pane updates all. When unlinked, each pane has its own view. Only meaningful when the layout has 2+ areas.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'Recipe id (must be open).'},
                linked: {type: 'boolean'}
            },
            required: ['recipeId', 'linked']
        },
        handler$: ({params, request$}) =>
            guiRequest$(request$, 'set-sync', {
                recipeId: params.recipeId,
                linked: params.linked
            })
    },
    {
        name: 'map_set_view',
        description: 'Set the map view atomically. `areas` keys determine the layout. Valid key sets (no partial layouts, no empty panes):\n- `{center}` (single)\n- `{left, right}`\n- `{top, bottom}`\n- `{top, bottom-left, bottom-right}` (top + bottom split)\n- `{bottom, top-left, top-right}` (bottom + top split)\n- `{left, top-right, bottom-right}` (left + right split)\n- `{right, top-left, bottom-left}` (right + left split)\n- `{top-left, top-right, bottom-left, bottom-right}` (quadrants)\n\n**Each area renders ONE source — no raster overlays. To compare datasets, use split panes; never offer "overlay".** Every area must specify a source. Foreign sources auto-register; areas auto-select a default visualization.\n\nReturns `{recipeId, layout, areas: [{area, sourceId, sourceType, asset?, bands?, presetVisualizations?, recipeId?}]}`. **For ASSET sources the response carries the resolved `bands` and `presetVisualizations` — use those directly; do NOT invent band names.**\n\nOnly call when the user asks for multi-pane or to change layout. Default is `{center}` — do not preemptively widen. If the user\'s layout doesn\'t map cleanly to a valid set, ASK.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'Recipe id (must be open).'},
                areas: {
                    type: 'object',
                    description: 'Area-key → source. Keys must match exactly one valid layout (see tool description). Every entry must specify a source.',
                    minProperties: 1,
                    maxProperties: 4,
                    propertyNames: {
                        enum: ['center', 'left', 'right', 'top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right']
                    },
                    additionalProperties: sourceSchema
                }
            },
            required: ['recipeId', 'areas']
        },
        handler$: ({params, request$}) =>
            guiRequest$(
                request$,
                'set-view',
                {recipeId: params.recipeId, areas: params.areas},
                {timeoutMs: SET_VIEW_TIMEOUT_MS}
            )
    },
    {
        name: 'map_set_feature_layers',
        description: 'Toggle vector overlays on a map area (AOI boundary, labels). `enabled` lists layer ids to turn ON; unlisted are turned OFF. Empty array hides both. Dynamic per-vis overlays (legend/palette/values) are auto-managed and NOT controlled here.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'Recipe id (must be open).'},
                area: {type: 'string', description: 'Target area key.'},
                enabled: {
                    type: 'array',
                    items: {type: 'string', enum: ['aoi', 'labels']},
                    uniqueItems: true,
                    description: '`aoi` = AOI boundary outline. `labels` = country/area name labels.'
                }
            },
            required: ['recipeId', 'area', 'enabled']
        },
        handler$: ({params, request$}) =>
            guiRequest$(request$, 'set-feature-layers', {
                recipeId: params.recipeId,
                area: params.area,
                enabled: params.enabled
            })
    },
    {
        name: 'map_set_image_layer',
        description: 'Swap the source on ONE existing area without changing layout. To change panes, use map_set_view. Foreign sources auto-register. **Area auto-selects a default visualization on source change** — do NOT call recipe_set_visualization unless the user named a specific vis or the default is clearly wrong.\n\nReturns `{recipeId, area, sourceId, sourceType, asset?, bands?, presetVisualizations?, recipeId?}`. **For ASSET sources the response carries `bands` + `presetVisualizations` — use those, do NOT invent band names.**',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'Recipe id (must be open).'},
                area: {type: 'string', description: 'Target area key. See live keys in `## Current Context` Map areas.'},
                source: sourceSchema
            },
            required: ['recipeId', 'area', 'source']
        },
        handler$: ({params, request$}) =>
            guiRequest$(
                request$,
                'set-image-layer',
                {
                    recipeId: params.recipeId,
                    area: params.area,
                    source: params.source
                },
                {timeoutMs: SET_VIEW_TIMEOUT_MS}
            )
    }
]

module.exports = {createMapTools}

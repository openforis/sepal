const createGuiTools = () => [
    {
        name: 'gui_open_recipe',
        description: 'Tell the user\'s browser to open/load a recipe in the SEPAL interface',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'The recipe ID to open'}
            },
            required: ['recipeId']
        },
        handler: async ({params, send}) => {
            send({type: 'gui-action', action: 'open', recipeId: params.recipeId})
            return {success: true, data: {action: 'open', recipeId: params.recipeId}}
        }
    },
    {
        name: 'gui_reload_recipe',
        description: 'Tell the browser to reload an already-open recipe to reflect changes',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'The recipe ID to reload'}
            },
            required: ['recipeId']
        },
        handler: async ({params, send}) => {
            send({type: 'gui-action', action: 'reload', recipeId: params.recipeId})
            return {success: true, data: {action: 'reload', recipeId: params.recipeId}}
        }
    },
    {
        name: 'gui_close_recipe',
        description: 'Tell the browser to close a recipe tab',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'The recipe ID to close'}
            },
            required: ['recipeId']
        },
        handler: async ({params, send}) => {
            send({type: 'gui-action', action: 'close', recipeId: params.recipeId})
            return {success: true, data: {action: 'close', recipeId: params.recipeId}}
        }
    },
    {
        name: 'gui_list_visualizations',
        description: 'List the band combinations (visualizations) currently available for an open recipe in the browser. The browser computes the list from the loaded recipe state, so it reflects exactly what the user can pick from in the UI — including state-dependent filtering (e.g. SR vs TOA, available bands, user-defined visualizations). Returns {groups, areas}: groups is an array of option groups (each {label, options:[{value, label, visParams}]}); areas is a map of area-key -> currently-selected visParams. Each visParams object is fully populated and can be passed straight back to gui_set_visualization. A typical single-pane layout uses the area key "center"; split layouts have multiple area keys. The recipe must be open in the browser.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'The recipe ID (must be open in the browser)'}
            },
            required: ['recipeId']
        },
        handler: async ({params, request}) => {
            try {
                const data = await request({type: 'gui-action', action: 'list-visualizations', recipeId: params.recipeId})
                return {success: true, data}
            } catch (error) {
                return {success: false, error: {code: 'GUI_REQUEST_FAILED', message: error.message}}
            }
        }
    },
    {
        name: 'gui_set_visualization',
        description: 'Apply a band combination to a map area of an open recipe. The visParams object must be one of the entries returned by gui_list_visualizations (or a structurally compatible object: type, bands, min, max, optional gamma/palette/inverted). The change is dispatched directly to the open recipe in the browser and is auto-saved by the GUI; no separate save or reload is needed. The recipe must be open in the browser.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'The recipe ID (must be open in the browser)'},
                area: {type: 'string', description: 'The map area key. Use "center" for a single-pane layout; use one of the area keys returned by gui_list_visualizations for split layouts.'},
                visParams: {
                    type: 'object',
                    description: 'Visualization parameters — pass an entry from gui_list_visualizations.',
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
        handler: async ({params, request}) => {
            try {
                const data = await request({
                    type: 'gui-action',
                    action: 'set-visualization',
                    recipeId: params.recipeId,
                    area: params.area,
                    visParams: params.visParams
                })
                return {success: true, data}
            } catch (error) {
                return {success: false, error: {code: 'GUI_REQUEST_FAILED', message: error.message}}
            }
        }
    }
]

module.exports = {createGuiTools}

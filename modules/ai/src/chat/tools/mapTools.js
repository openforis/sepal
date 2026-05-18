// Map-inspection tools: map_area_list (per-recipe area layout) and
// layer_list (per-area image and feature layers). Read-only; both
// delegate to the GUI via guiProductRequest.

const {guiProductRequest$} = require('./guiProductRequest')

function mapTools(guiRequests) {
    return [
        mapAreaListTool(guiRequests),
        layerListTool(guiRequests)
    ]
}

function mapAreaListTool(guiRequests) {
    return {
        name: 'map_area_list',
        description: 'Map areas for active recipe -> layout, areas (with sourceId/sourceLabel/sourceType), aoi, view. Read-only. Use for "what map areas", "which layout", "where is the map looking". Returns {available:false, reason} when no recipe is active.',
        parameters: {type: 'object', properties: {}, additionalProperties: false},
        invoke$: (_input, context) => guiProductRequest$(guiRequests, context, 'list-map-areas', {})
    }
}

function layerListTool(guiRequests) {
    return {
        name: 'layer_list',
        description: 'Layers per map area for active recipe -> per area: imageLayer (source + visualization), featureLayers (aoi/labels with enabled flag). Read-only. Use for "what layers", "is X visible", "why is map blank". Returns {available:false, reason} when no recipe is active.',
        parameters: {type: 'object', properties: {}, additionalProperties: false},
        invoke$: (_input, context) => guiProductRequest$(guiRequests, context, 'list-layers', {})
    }
}

module.exports = {mapTools}

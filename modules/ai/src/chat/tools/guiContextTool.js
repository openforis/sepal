// get_gui_context tool: returns the runtime GUI context shaped by
// turnContext.shapeTurnContext.

const {of} = require('rxjs')
const {shapeTurnContext} = require('../turnContext')

function guiContextTool() {
    return {
        name: 'get_gui_context',
        description: "User's current GUI state: active section, selected & open recipes/projects/apps, map view.",
        parameters: {type: 'object', properties: {}, additionalProperties: false},
        invoke$: (_input, context) => of(guiContextSnapshot(context?.guiContext))
    }
}

function guiContextSnapshot(guiContext) {
    const shaped = shapeTurnContext(guiContext)
    return shaped
        ? {source: 'turn_snapshot', available: true, guiContext: shaped}
        : {source: 'turn_snapshot', available: false}
}

module.exports = {guiContextTool}

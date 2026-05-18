const {of} = require('rxjs')
const {shapeTurnContext} = require('../turnContext')

function contextTool() {
    return {
        name: 'get_context',
        description: "User's current GUI state: active section, selected & open recipes/projects/apps, map view.",
        parameters: {type: 'object', properties: {}, additionalProperties: false},
        invoke$: (_input, context) => of(contextSnapshot(context?.selection))
    }
}

function contextSnapshot(selection) {
    const shaped = shapeTurnContext(selection)
    return shaped
        ? {source: 'turn_snapshot', available: true, selection: shaped}
        : {source: 'turn_snapshot', available: false}
}

module.exports = {contextTool}

const {llmMetadataFromRules} = require('../llmMetadataFromRules')
const {llmMetadataFromSchema} = require('../llmMetadataFromSchema')
const schema = require('./schema.json')
const {rules} = require('./rules')

// Constraints come from two generic, recipe-agnostic sources: validation rules
// (cross-field coupling the rules enforce) and the JSON Schema's conditional
// requirements (if/then required companions). Both share the {name, description,
// paths} shape, so prepare_update expansion and the update manual consume them
// uniformly.
function getLlmMetadata() {
    return {
        constraints: [
            ...llmMetadataFromRules(rules).constraints,
            ...llmMetadataFromSchema(schema).constraints
        ]
    }
}

module.exports = {getLlmMetadata}

import {llmMetadataFromRules} from '../llmMetadataFromRules.js'
import {llmMetadataFromSchema} from '../llmMetadataFromSchema.js'
import {rules} from './rules.js'
import schema from './schema.json' with {type: 'json'}

// Constraints come from two generic, recipe-agnostic sources: validation rules
// (cross-field coupling the rules enforce) and the JSON Schema's conditional
// requirements (if/then required companions). Both share the {name, description,
// paths} shape, so handle preparation and generated recipe references consume
// them uniformly.
function getLlmMetadata() {
    return {
        constraints: [
            ...llmMetadataFromRules(rules).constraints,
            ...llmMetadataFromSchema(schema).constraints
        ]
    }
}

export {getLlmMetadata}

const {llmMetadataFromRules} = require('../llmMetadataFromRules')
const {rules} = require('./rules')

function getLlmMetadata() {
    return llmMetadataFromRules(rules)
}

module.exports = {getLlmMetadata}

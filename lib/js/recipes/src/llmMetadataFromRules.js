// Projects validation rules into LLM-oriented constraint metadata. A rule that
// declares the model-relative paths it binds becomes a constraint carrying that
// coupling. Generic: no recipe-type knowledge. Returns fresh objects each call
// so callers can't mutate shared rule metadata across calls.

function llmMetadataFromRules(rules) {
    const constraints = rules
        .filter(rule => rule.paths)
        .map(rule => ({name: rule.name, description: rule.description, paths: [...rule.paths]}))
    return {constraints}
}

module.exports = {llmMetadataFromRules}

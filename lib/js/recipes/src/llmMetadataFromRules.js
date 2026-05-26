// Projects validation rules into LLM-oriented constraint metadata. A rule that
// declares the model-relative paths it binds becomes a constraint carrying that
// coupling. A rule may also declare `subjectPaths` — the violated path(s) the
// rule asserts about; remaining paths are triggers/context. The handle prepare
// step uses this to promote subjects to writable when a trigger handle is
// writable, while keeping pure trigger/context paths read-only. Generic: no
// recipe-type knowledge. Returns fresh objects each call so callers can't
// mutate shared rule metadata across calls.

function llmMetadataFromRules(rules) {
    const constraints = rules
        .filter(rule => rule.paths)
        .map(rule => ({
            name: rule.name,
            description: rule.description,
            paths: [...rule.paths],
            ...(rule.subjectPaths ? {subjectPaths: [...rule.subjectPaths]} : {})
        }))
    return {constraints}
}

module.exports = {llmMetadataFromRules}

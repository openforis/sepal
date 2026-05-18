// Composes a recipe specialist's system prompt: base frame first (cache-stable
// across recipe types), then a type-specific section assembled from the spec's
// promptFacts(). Returns the base unchanged when no spec / no promptFacts is
// available. With {includeSchema: true} (used by write-capable specialists),
// the spec's JSON Schema is appended as a fenced json block after the facts.

function assembleSpecialistPrompt(basePrompt, spec, {includeSchema = false} = {}) {
    if (!spec?.promptFacts) return basePrompt
    const facts = spec.promptFacts()
    const sections = [
        basePrompt,
        '',
        '---',
        '',
        `Recipe: ${spec.id} (${spec.name})`,
        facts.description,
        '',
        `Choose when: ${facts.chooseWhen}`,
        `Don't choose when: ${facts.dontChooseWhen}`,
        '',
        `Outputs: ${facts.outputs}`,
        '',
        'Use cases:',
        ...facts.useCases.map(useCase => `- ${useCase}`)
    ]
    if (includeSchema && spec.schema) {
        sections.push('', 'Schema:', '```json', JSON.stringify(spec.schema), '```')
    }
    return sections.join('\n')
}

module.exports = {assembleSpecialistPrompt}

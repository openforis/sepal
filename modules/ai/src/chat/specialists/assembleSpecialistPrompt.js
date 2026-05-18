// Composes a recipe specialist's system prompt: base frame first (cache-stable
// across recipe types), then a type-specific section assembled from the spec's
// promptFacts(). Returns the base unchanged when no spec / no promptFacts is
// available.

function assembleSpecialistPrompt(basePrompt, spec) {
    if (!spec?.promptFacts) return basePrompt
    const facts = spec.promptFacts()
    return [
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
    ].join('\n')
}

module.exports = {assembleSpecialistPrompt}

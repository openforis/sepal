// Composes a recipe specialist's system prompt: base frame first (cache-stable
// across recipe types), then a purpose-specific section assembled from the
// spec's per-purpose facts bucket. Returns the base unchanged when the spec
// has no facts for the requested purpose. {includeSchema: true} additionally
// appends the spec's JSON Schema as a compact fenced json block (write-capable
// specialists only — ignored for purpose 'describe').

const PURPOSES = {
    describe: {factsMethod: 'describeFacts', sectionsFor: describeSections, schemaAllowed: false},
    update: {factsMethod: 'editFacts', sectionsFor: updateSections, schemaAllowed: true}
}

function assembleSpecialistPrompt(basePrompt, spec, {purpose, includeSchema = false} = {}) {
    const config = PURPOSES[purpose]
    if (!config) {
        throw new Error(`assembleSpecialistPrompt: unknown purpose ${JSON.stringify(purpose)} (expected one of ${Object.keys(PURPOSES).join(', ')})`)
    }
    if (!spec?.[config.factsMethod]) return basePrompt
    const facts = spec[config.factsMethod]()
    const sections = [
        basePrompt,
        '',
        '---',
        '',
        `Recipe: ${spec.id} (${spec.name})`,
        ...config.sectionsFor(facts)
    ]
    if (includeSchema && config.schemaAllowed && spec.schema) {
        sections.push('', 'Schema:', '```json', JSON.stringify(spec.schema), '```')
    }
    return sections.join('\n')
}

function describeSections(facts) {
    return [facts.description, '', `Outputs: ${facts.outputs}`]
}

function updateSections(facts) {
    return ['Edit guidance:', ...facts.guidance.map(item => `- ${item}`)]
}

module.exports = {assembleSpecialistPrompt}

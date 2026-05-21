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
        `Recipe type: ${spec.name}`,
        ...config.sectionsFor(spec, facts)
    ]
    if (includeSchema && config.schemaAllowed && spec.schema) {
        sections.push('', 'Schema:', '```json', JSON.stringify(spec.schema), '```')
    }
    return sections.join('\n')
}

function describeSections(spec, facts) {
    const sections = [facts.description, '', `Outputs: ${facts.outputs}`]
    const valueLabels = spec.valueLabels?.()
    if (valueLabels) {
        sections.push('', 'Value labels:', valueLabels)
    }
    return sections
}

function updateSections(spec, facts) {
    const sections = ['Edit guidance:', ...facts.guidance.map(item => `- ${item}`)]
    const manual = spec.updateManual?.()
    if (manual) {
        sections.push('', 'Update manual:', manual)
    }
    return sections
}

module.exports = {assembleSpecialistPrompt}

// Composes the describe specialist's system prompt: base frame first
// (cache-stable across recipe types) then the spec's describe facts. Returns
// the base unchanged when the spec has no describe facts.
//
// The update specialist no longer uses this helper — its prompt is a
// generic, recipe-agnostic frame, and recipe metadata reaches the LLM
// through the prepared handle packet instead.

const {valueLabelsFromSchema} = require('./valueLabelsFromSchema')

const PURPOSES = {
    describe: {factsMethod: 'describeFacts', sectionsFor: describeSections}
}

function assembleSpecialistPrompt(basePrompt, spec, {purpose} = {}) {
    const config = PURPOSES[purpose]
    if (!config) {
        throw new Error(`assembleSpecialistPrompt: unknown purpose ${JSON.stringify(purpose)} (expected one of ${Object.keys(PURPOSES).join(', ')})`)
    }
    if (!spec?.[config.factsMethod]) return basePrompt
    const facts = spec[config.factsMethod]()
    return [
        basePrompt,
        '',
        '---',
        '',
        `Recipe type: ${spec.name}`,
        ...config.sectionsFor(spec, facts)
    ].join('\n')
}

function describeSections(spec, facts) {
    const sections = [facts.description, '', `Outputs: ${facts.outputs}`]
    const valueLabels = spec.schema ? valueLabelsFromSchema(spec.schema) : ''
    if (valueLabels) {
        sections.push('', 'Value labels:', valueLabels)
    }
    return sections
}

module.exports = {assembleSpecialistPrompt}

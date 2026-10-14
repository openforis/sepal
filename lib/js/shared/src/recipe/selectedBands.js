import {MISSING_INPUT_BAND} from './output/diagnostic.js'

// Where a recipe names bands of an input one field at a time - the band Class Change reads, and Index Change's band and
// error band - each one named that the input's current description does not provide refuses it, located at the field
// naming it. An input not described establishes nothing, and a field left empty names nothing. `selections` are
// [{role, key, fields}]: the role filling `model[key]`, and the fields of that selection naming a band each.
export const selectedBandRefusals = (model, describedInputs, selections) =>
    selections.flatMap(({role, key, fields}) => {
        const [input] = describedInputs(role) || []
        if (!input) {
            return []
        }
        const available = new Set(input.description.output.bands.map(({name}) => name))
        return fields
            .filter(field => model?.[key]?.[field] && !available.has(model[key][field]))
            .map(field => ({code: MISSING_INPUT_BAND, path: ['model', key, field]}))
    })

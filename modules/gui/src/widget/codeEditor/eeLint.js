import _ from 'lodash'

import {
    analyzeExpression,
    INVALID_ARG_COUNT,
    INVALID_BAND,
    INVALID_BAND_COUNT,
    SYNTAX_ERROR,
    UNDEFINED_VARIABLE
} from './expressionAnalysis'

// The editor's lint of an expression: what its analysis finds (expressionAnalysis.js), as diagnostics where they lie,
// and the bands it derives, told to `onBandChanged` whenever they change.
export const eeLint = (images, msg, onBandChanged) => {
    let lastIncludedBands = []
    let lastUsedBands = []

    return view => {
        const {diagnostics, usedBands, includedBands} = analyzeExpression(view.state.doc.toString(), images)
        notifyBandChanges({usedBands, includedBands})
        return diagnostics.map(({code, from, to, values}) => ({
            from,
            to,
            severity: 'error',
            message: msg(MESSAGES[code], values)
        }))
    }

    function notifyBandChanges({usedBands, includedBands}) {
        onBandChanged
            && (!_.isEqual(lastIncludedBands, includedBands) || !_.isEqual(lastUsedBands, usedBands))
            && onBandChanged({usedBands, includedBands})
        lastIncludedBands = includedBands
        lastUsedBands = usedBands
    }
}

const MESSAGES = {
    [SYNTAX_ERROR]: 'widget.codeEditor.eeLint.syntaxError',
    [UNDEFINED_VARIABLE]: 'widget.codeEditor.eeLint.undefinedVariable',
    [INVALID_ARG_COUNT]: 'widget.codeEditor.eeLint.invalidArgCount',
    [INVALID_BAND]: 'widget.codeEditor.eeLint.invalidBand',
    [INVALID_BAND_COUNT]: 'widget.codeEditor.eeLint.invalidBandCount'
}

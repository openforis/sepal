import {javascript} from '@codemirror/lang-javascript'
import {EditorState} from '@codemirror/state'
import {describe, expect, it} from 'vitest'

import {eeLint} from './eeLint'
import {analyzeExpression} from './expressionAnalysis'

// What an expression is judged and derived as: its problems, each where it lies, and the bands it reads and yields, by
// identity and in order. The editor's lint says what the analysis finds (eeLint.js), so an expression is accepted, and
// its bands derived, alike wherever it is read.

describe.each([
    ['the analysis', expression => fromAnalysis(analyzeExpression(expression, SCOPE))],
    ['the editor lint', expression => fromLint(expression)]
])('an expression read by %s', (_reader, read) => {
    it.each(EXPRESSIONS)('%j is judged and derived as it always has been', (expression, problems, usedBands, includedBands) => {
        expect(read(expression)).toEqual({problems, usedBands, includedBands})
    })
})

// Inputs and an earlier calculation, as a calculation sees them, their band ids apart from their names.
const SCOPE = [
    image('img-1', 'i1', [['r1', 'red'], ['n1', 'nir']]),
    image('img-2', 'i2', [['a2', 'a'], ['b2', 'b'], ['c2', 'c']]),
    image('img-3', 'i3', [['z3', 'z']]),
    image('calc-1', 'c1', [['x1', 'x']]),
    image('img-4', 'i4', [['p4', 'nir'], ['q4', 'swir']])
]

// [expression, its problems as `CODE {values}@from-to`, the bands it uses, the bands it yields], a band as
// `imageId/id:name`.
const EXPRESSIONS = [
    ['i1.nir', [], ['img-1/n1:nir'], ['img-1/n1:nir']],
    ['i1["nir"]', [], ['img-1/n1:nir'], ['img-1/n1:nir']],
    ['i1[\'nir\']', [], ['img-1/n1:nir'], ['img-1/n1:nir']],
    ['i1 . nir', [], ['img-1/n1:nir'], ['img-1/n1:nir']],
    ['i1 ["nir"]', [], ['img-1/n1:nir'], ['img-1/n1:nir']],
    ['i1', [], ['img-1/r1:red', 'img-1/n1:nir'], ['img-1/r1:red', 'img-1/n1:nir']],
    ['i2', [], ['img-2/a2:a', 'img-2/b2:b', 'img-2/c2:c'], ['img-2/a2:a', 'img-2/b2:b', 'img-2/c2:c']],
    ['i1 + i3', [], ['img-1/r1:red', 'img-1/n1:nir', 'img-3/z3:z'], ['img-1/r1:red', 'img-1/n1:nir']],
    ['i3 + i1', [], ['img-3/z3:z', 'img-1/r1:red', 'img-1/n1:nir'], ['img-1/r1:red', 'img-1/n1:nir']],
    ['i1 + i2', ['INVALID_BAND_COUNT {"imageName":"i2","expectedBandCount":2,"bandCount":3}@5-7'], ['img-1/r1:red', 'img-1/n1:nir', 'img-2/a2:a', 'img-2/b2:b', 'img-2/c2:c'], ['img-2/a2:a', 'img-2/b2:b', 'img-2/c2:c']],
    ['i2 + i1 + i3', ['INVALID_BAND_COUNT {"imageName":"i1","expectedBandCount":3,"bandCount":2}@5-7'], ['img-2/a2:a', 'img-2/b2:b', 'img-2/c2:c', 'img-1/r1:red', 'img-1/n1:nir', 'img-3/z3:z'], ['img-2/a2:a', 'img-2/b2:b', 'img-2/c2:c']],
    ['i1.nir + i2', [], ['img-1/n1:nir', 'img-2/a2:a', 'img-2/b2:b', 'img-2/c2:c'], ['img-2/a2:a', 'img-2/b2:b', 'img-2/c2:c']],
    ['i3.z + i1.red', [], ['img-3/z3:z', 'img-1/r1:red'], ['img-3/z3:z']],
    ['i1 + i4', [], ['img-1/r1:red', 'img-1/n1:nir', 'img-4/p4:nir', 'img-4/q4:swir'], ['img-1/r1:red', 'img-1/n1:nir']],
    ['i4 + i1', [], ['img-4/p4:nir', 'img-4/q4:swir', 'img-1/r1:red', 'img-1/n1:nir'], ['img-4/p4:nir', 'img-4/q4:swir']],
    ['i1.nir + i4.nir', [], ['img-1/n1:nir', 'img-4/p4:nir'], ['img-1/n1:nir']],
    ['i4.nir + i1', [], ['img-4/p4:nir', 'img-1/r1:red', 'img-1/n1:nir'], ['img-1/r1:red', 'img-1/n1:nir']],
    ['i1 + i1.nir', [], ['img-1/r1:red', 'img-1/n1:nir'], ['img-1/r1:red', 'img-1/n1:nir']],
    ['i1.red + i1.nir + i1.red', [], ['img-1/r1:red', 'img-1/n1:nir'], ['img-1/r1:red']],
    ['i1.foo', ['INVALID_BAND {"imageName":"i1","bandName":"foo"}@3-6'], [], ['/constant:constant']],
    ['i1["foo"]', ['INVALID_BAND {"imageName":"i1","bandName":"foo"}@3-8'], [], ['/constant:constant']],
    ['foo', ['UNDEFINED_VARIABLE {"variableName":"foo"}@0-3'], [], ['/constant:constant']],
    ['c1.x', [], ['calc-1/x1:x'], ['calc-1/x1:x']],
    ['c1', [], ['calc-1/x1:x'], ['calc-1/x1:x']],
    ['foo + i1.bar', ['UNDEFINED_VARIABLE {"variableName":"foo"}@0-3', 'INVALID_BAND {"imageName":"i1","bandName":"bar"}@9-12'], [], ['/constant:constant']],
    ['abs(i1.nir)', [], ['img-1/n1:nir'], ['img-1/n1:nir']],
    ['max(i1.nir, i1.red)', [], ['img-1/n1:nir', 'img-1/r1:red'], ['img-1/n1:nir']],
    ['max(i1.nir)', ['INVALID_ARG_COUNT {"argCount":1,"expectedArgCount":2}@3-11'], ['img-1/n1:nir'], ['img-1/n1:nir']],
    ['max(i1.nir, i1.red, 1)', ['INVALID_ARG_COUNT {"argCount":3,"expectedArgCount":2}@3-22'], ['img-1/n1:nir', 'img-1/r1:red'], ['img-1/n1:nir']],
    ['max()', ['INVALID_ARG_COUNT {"argCount":0,"expectedArgCount":2}@3-5'], [], ['/constant:constant']],
    ['floor(i1.nir)', ['UNDEFINED_VARIABLE {"variableName":"floor"}@0-5'], ['img-1/n1:nir'], ['img-1/n1:nir']],
    ['Math.abs(i1.nir)', ['UNDEFINED_VARIABLE {"variableName":"Math"}@0-4'], ['img-1/n1:nir'], ['img-1/n1:nir']],
    ['PI * i1.nir', [], ['img-1/n1:nir'], ['img-1/n1:nir']],
    ['E', [], [], ['/constant:constant']],
    ['NaN', ['UNDEFINED_VARIABLE {"variableName":"NaN"}@0-3'], [], ['/constant:constant']],
    ['abs', ['UNDEFINED_VARIABLE {"variableName":"abs"}@0-3'], [], ['/constant:constant']],
    ['random(1, 2)', [], [], ['/constant:constant']],
    ['random(1, \'uniform\')', [], [], ['/constant:constant']],
    ['i1.nir > 0 ? 1 : 0', [], ['img-1/n1:nir'], ['img-1/n1:nir']],
    ['i1.nir > 0 && i1.red < 1', [], ['img-1/n1:nir', 'img-1/r1:red'], ['img-1/n1:nir']],
    ['!i1.nir', [], ['img-1/n1:nir'], ['img-1/n1:nir']],
    ['-i1.nir', [], ['img-1/n1:nir'], ['img-1/n1:nir']],
    ['i1.nir ** 2', [], ['img-1/n1:nir'], ['img-1/n1:nir']],
    ['i1.nir % 2', [], ['img-1/n1:nir'], ['img-1/n1:nir']],
    ['i1.nir | 1', [], ['img-1/n1:nir'], ['img-1/n1:nir']],
    ['i1.nir >> 1', [], ['img-1/n1:nir'], ['img-1/n1:nir']],
    ['i1.nir >>> 1', ['SYNTAX_ERROR@9-10'], ['img-1/n1:nir'], ['img-1/n1:nir']],
    ['~i1.nir', ['SYNTAX_ERROR@0-1'], ['img-1/n1:nir'], ['img-1/n1:nir']],
    ['i1.nir === 1', ['SYNTAX_ERROR@9-10'], ['img-1/n1:nir'], ['img-1/n1:nir']],
    ['i1.nir == 1', [], ['img-1/n1:nir'], ['img-1/n1:nir']],
    ['x = 1', ['UNDEFINED_VARIABLE {"variableName":"x"}@0-1'], [], ['/constant:constant']],
    ['"a"', [], [], ['/constant:constant']],
    ['true', [], [], ['/constant:constant']],
    ['this', [], [], ['/constant:constant']],
    ['[1, 2]', ['SYNTAX_ERROR@0-1'], [], ['/constant:constant']],
    ['i1[0]', ['SYNTAX_ERROR@2-3'], ['img-1/r1:red', 'img-1/n1:nir'], ['img-1/r1:red', 'img-1/n1:nir']],
    ['(i1).nir', ['SYNTAX_ERROR@4-5'], ['img-1/r1:red', 'img-1/n1:nir'], ['img-1/r1:red', 'img-1/n1:nir']],
    ['i1.nir.x', ['SYNTAX_ERROR@6-7'], ['img-1/n1:nir'], ['img-1/n1:nir']],
    ['i1["n" + "ir"]', ['INVALID_BAND {"imageName":"i1","bandName":"n\\" + \\"ir"}@3-13'], [], ['/constant:constant']],
    ['i1.nir; 1', [], ['img-1/n1:nir'], ['img-1/n1:nir']],
    ['i1.nir, 1', [], ['img-1/n1:nir'], ['img-1/n1:nir']],
    ['i1.nir in i1', [], ['img-1/n1:nir', 'img-1/r1:red'], ['img-1/r1:red', 'img-1/n1:nir']],
    ['', [], [], ['/constant:constant']],
    ['42', [], [], ['/constant:constant']],
    ['0x10', ['SYNTAX_ERROR@1-2'], [], ['/constant:constant']],
    ['.5', [], [], ['/constant:constant']],
    ['i1.red.nir', ['SYNTAX_ERROR@6-7'], ['img-1/r1:red'], ['img-1/r1:red']],
    ['abs(i1).nir', ['SYNTAX_ERROR@7-8'], ['img-1/r1:red', 'img-1/n1:nir'], ['img-1/r1:red', 'img-1/n1:nir']],
    ['i1?.nir', [], ['img-1/r1:red', 'img-1/n1:nir'], ['img-1/r1:red', 'img-1/n1:nir']],
    ['b(0)', ['UNDEFINED_VARIABLE {"variableName":"b"}@0-1'], [], ['/constant:constant']],
    ['(i1.nir', ['SYNTAX_ERROR@7-7'], ['img-1/n1:nir'], ['img-1/n1:nir']],
    ['i1.nir)', ['SYNTAX_ERROR@6-7'], ['img-1/n1:nir'], ['img-1/n1:nir']],
    ['i1.', ['SYNTAX_ERROR@2-3'], ['img-1/r1:red', 'img-1/n1:nir'], ['img-1/r1:red', 'img-1/n1:nir']],
    ['i1[', ['SYNTAX_ERROR@2-3'], ['img-1/r1:red', 'img-1/n1:nir'], ['img-1/r1:red', 'img-1/n1:nir']],
    ['i1.nir\n+ i1.red', [], ['img-1/n1:nir', 'img-1/r1:red'], ['img-1/n1:nir']]
]

function image(imageId, name, bands) {
    return {imageId, name, includedBands: bands.map(([id, name]) => ({id, name}))}
}

function fromAnalysis({diagnostics, usedBands, includedBands}) {
    return {
        problems: diagnostics.map(({code, values, from, to}) => problem(code, values, from, to)),
        usedBands: usedBands.map(bandKey),
        includedBands: includedBands.map(bandKey)
    }
}

function fromLint(expression) {
    let bands = null
    const state = EditorState.create({doc: expression, extensions: javascript()})
    const diagnostics = eeLint(SCOPE, (key, values) => ({key, values}), changed => bands = changed)({state})
    return {
        problems: diagnostics.map(({message: {key, values}, from, to}) => problem(LINT_CODES[key], values, from, to)),
        usedBands: bands.usedBands.map(bandKey),
        includedBands: bands.includedBands.map(bandKey)
    }
}

const LINT_CODES = {
    'widget.codeEditor.eeLint.syntaxError': 'SYNTAX_ERROR',
    'widget.codeEditor.eeLint.undefinedVariable': 'UNDEFINED_VARIABLE',
    'widget.codeEditor.eeLint.invalidArgCount': 'INVALID_ARG_COUNT',
    'widget.codeEditor.eeLint.invalidBand': 'INVALID_BAND',
    'widget.codeEditor.eeLint.invalidBandCount': 'INVALID_BAND_COUNT'
}

function problem(code, values, from, to) {
    return `${code}${values ? ` ${JSON.stringify(values)}` : ''}@${from}-${to}`
}

function bandKey({imageId, id, name}) {
    return `${imageId || ''}/${id}:${name}`
}

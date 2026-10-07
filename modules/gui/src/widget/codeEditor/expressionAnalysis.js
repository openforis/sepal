import {javascriptLanguage} from '@codemirror/lang-javascript'
import jsep from 'jsep'
import _ from 'lodash'

import {argCountByFunction, mathOptions} from './mathOptions'

// What an Earth Engine expression over named images is judged and derived as, from its text and the images it may read
// (`{imageId, name, includedBands}`): pure, as the editor's lint shows it (eeLint.js) and anything else reads it.
//
//   diagnostics    [{code, from, to, values}], where each problem lies in the text
//   usedBands      the bands it reads, each once, as `{...band, imageId, imageName}`, in the order first read
//   includedBands  the bands it yields: the bands of the image it reads whole with the most of them, or else the first
//                  band it reads, or else `constant`
//
// The text is parsed as JavaScript (the grammar the editor highlights by), and must also parse as an expression jsep
// accepts with the operators below. A problem is reported where no earlier one overlaps it.

export const SYNTAX_ERROR = 'SYNTAX_ERROR'
export const UNDEFINED_VARIABLE = 'UNDEFINED_VARIABLE'
export const INVALID_ARG_COUNT = 'INVALID_ARG_COUNT'
export const INVALID_BAND = 'INVALID_BAND'
export const INVALID_BAND_COUNT = 'INVALID_BAND_COUNT'

jsep.addBinaryOp('**')
jsep.removeBinaryOp('>>>')
jsep.removeBinaryOp('===')
jsep.removeBinaryOp('!==')
jsep.removeUnaryOp('~')

const MATH_NAMES = mathOptions(() => null).map(({name}) => name)

export const analyzeExpression = (expression, images) => {
    const bandsByVariableName = {}
    images.forEach(({name, imageId, includedBands}) =>
        bandsByVariableName[name] = includedBands
            .map((band => ({...band, imageId, imageName: name})))
    )
    MATH_NAMES.forEach(name => bandsByVariableName[name] = [])

    const diagnostics = []
    let includedBands = []
    let usedBands = []
    let maxUsedImageBandCount = 0

    javascriptLanguage.parser.parse(expression).cursor().iterate(node => {
        if (node.type.isError) {
            handleSyntaxError(node)
        } else if (node.name === 'VariableName') {
            handleVariableName(node)
        } else if (node.name === '.') {
            handleDotSyntax(node)
        } else if (node.name === '[') {
            handleArraySyntax(node)
        }
    })

    validateSyntax()
    if (!includedBands.length) {
        includedBands = [{id: 'constant', name: 'constant'}]
    }
    return {diagnostics, usedBands, includedBands}

    function sliceText(node) {
        return expression.slice(node.from, node.to)
    }

    function handleVariableName(node) {
        const variableName = sliceText(node)
        const hasArgList = node.node.nextSibling?.name === 'ArgList'
        const variableBands = bandsByVariableName[variableName]
        const isValidVariableName = !!variableBands

        if (isValidVariableName) {
            if (hasArgList) {
                validateFunctionArgCount({node, variableName})
            } else {
                const isMathFunction = Object.keys(argCountByFunction).includes(variableName)
                if (isMathFunction) { // Math function without arguments
                    report(node, UNDEFINED_VARIABLE, {variableName})
                } else { // Variable
                    const {bandName, bandNameNode} = extractBandName(node)
                    if (bandName) {
                        handleBandName({variableName, bandName, bandNameNode})
                    } else {
                        const bandCount = bandsByVariableName[variableName].length
                        if (maxUsedImageBandCount && bandCount > 1 && bandCount != maxUsedImageBandCount) {
                            report(node, INVALID_BAND_COUNT, {imageName: variableName, expectedBandCount: maxUsedImageBandCount, bandCount})
                        } else if (bandCount > 1) {
                            maxUsedImageBandCount = bandCount
                        }
                        if (variableBands?.length > includedBands.length) {
                            includedBands = variableBands
                        }
                        usedBands = _.uniqBy([...usedBands, ...variableBands], ({imageId, id}) => `${imageId}|${id}`)
                    }

                }
            }
        } else {
            report(node, UNDEFINED_VARIABLE, {variableName})
        }
    }

    function handleDotSyntax(node) {
        const prevNodeType = node.node.prevSibling?.name
        const nextNodeType = node.node.nextSibling?.name
        if (prevNodeType !== 'VariableName' || nextNodeType !== 'PropertyName') {
            report(node, SYNTAX_ERROR)
        }
    }

    function handleArraySyntax(node) {
        const prevNodeType = node.node.prevSibling?.name
        const nextNodeType = node.node.nextSibling?.name
        if (prevNodeType !== 'VariableName' || nextNodeType !== 'String') {
            report(node, SYNTAX_ERROR)
        }
    }

    function handleSyntaxError(node) {
        report(node, SYNTAX_ERROR)
    }

    function validateFunctionArgCount({node, variableName}) {
        const argListNode = node.node.nextSibling
        const argCount = Math.floor((countChildren(argListNode) - 1) / 2)
        const expectedArgCount = argCountByFunction[variableName]
        if (argCount !== expectedArgCount) {
            report(argListNode, INVALID_ARG_COUNT, {argCount, expectedArgCount})
        }
    }

    function countChildren(node) {
        const recurse = (node, count) => {
            const nextSibling = node.nextSibling
            return nextSibling
                ? recurse(nextSibling, count + 1)
                : count
        }

        const firstChild = node.firstChild
        return firstChild
            ? recurse(firstChild, 1)
            : 0
    }

    function extractBandName(variableNameNode) {
        const nextNode = variableNameNode.node?.nextSibling
        const bandNameNode = variableNameNode.node?.nextSibling?.nextSibling
        const bandName = nextNode?.name === '.'
            ? sliceText(bandNameNode)
            : nextNode?.name === '['
                ? sliceText(bandNameNode).slice(1, -1)
                : null
        return {bandName, bandNameNode}
    }

    function handleBandName({variableName, bandName, bandNameNode}) {
        const validBandName = bandsByVariableName[variableName]?.map(({name}) => name)?.includes(bandName)
        if (validBandName) {
            const band = bandsByVariableName[variableName].find(({name}) => name === bandName)
            if (!includedBands.length) {
                includedBands = [band]
            }
            usedBands = _.uniqBy([...usedBands, band], ({imageId, id}) => `${imageId}|${id}`)
        } else {
            report(bandNameNode, INVALID_BAND, {imageName: variableName, bandName})
        }
    }

    function validateSyntax() {
        if (diagnostics.length) {
            return
        }
        try {
            jsep.parse(expression)
        } catch (error) {
            report({from: error.index, to: Math.min(error.index + 1, expression.length)}, SYNTAX_ERROR)
        }
    }

    function report({from, to}, code, values) {
        const alreadyReported = diagnostics
            .find(diagnostic => to >= diagnostic.from && from <= diagnostic.to)
        alreadyReported || diagnostics.push({code, from, to, ...(values && {values})})
    }
}

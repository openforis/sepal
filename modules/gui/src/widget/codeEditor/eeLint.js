import {syntaxTree} from '@codemirror/language'
import jsep from 'jsep'
import _ from 'lodash'

import {argCountByFunction, mathOptions} from './mathOptions'

jsep.addBinaryOp('**')
jsep.removeBinaryOp('>>>')
jsep.removeBinaryOp('===')
jsep.removeBinaryOp('!==')
jsep.removeUnaryOp('~')

export const eeLint = (images, msg, onBandNamesChanged) => {
    let lastBands = []
    const bandsByVariableName = {}
    images.forEach(({name, imageId, includedBands}) =>
        bandsByVariableName[name] = includedBands
            .map((band => ({...band, imageId, imageName: name})))
    )
    mathOptions(msg).forEach(({name}) => bandsByVariableName[name] = [])

    return view => {
        const state = view.state
        const diagnostics = []
        let bands = []
        let maxUsedImageBandCount = 0

        syntaxTree(view.state).cursor().iterate(node => {
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
        notifyBandNameChanges()
        return diagnostics

        function sliceDoc(node) {
            return state.sliceDoc(node.from, node.to)
        }

        function handleVariableName(node) {
            const variableName = sliceDoc(node)
            const hasArgList = node.node.nextSibling?.name === 'ArgList'
            const variableBands = bandsByVariableName[variableName]
            const isValidVariableName = !!variableBands

            if (isValidVariableName) {
                if (hasArgList) {
                    validateFunctionArgCount({node, variableName})
                } else {
                    const isMathFunction = Object.keys(argCountByFunction).includes(variableName)
                    if (isMathFunction) { // Math function without arguments
                        report(undefinedVariable(node, {variableName}))
                    } else { // Variable
                        const bandCount = bandsByVariableName[variableName].length
                        if (maxUsedImageBandCount && bandCount > 1 && bandCount != maxUsedImageBandCount) {
                            report(invalidBandCount(node, {imageName: variableName, bandCount, maxUsedImageBandCount}))
                        } else if (bandCount > 1) {
                            maxUsedImageBandCount = bandCount
                        }
                    }
                }

                const {bandName, bandNameNode} = extractBandName(node)
                if (bandName) {
                    handleBandName({variableName, bandName, bandNameNode})
                } else {
                    if (variableBands?.length > bands.length) {
                        bands = variableBands
                    }
                }
            } else {
                report(undefinedVariable(node, {variableName}))
            }
        }

        function handleDotSyntax(node) {
            const prevNodeType = node.node.prevSibling?.name
            const nextNodeType = node.node.nextSibling?.name
            if (prevNodeType !== 'VariableName' || nextNodeType !== 'PropertyName') {
                report({
                    from: node.from,
                    to: node.to,
                    severity: 'error',
                    message: msg('widget.codeEditor.eeLint.syntaxError')
                })
            }
        }

        function handleArraySyntax(node) {
            const prevNodeType = node.node.prevSibling?.name
            const nextNodeType = node.node.nextSibling?.name
            if (prevNodeType !== 'VariableName' || nextNodeType !== 'String') {
                report({
                    from: node.from,
                    to: node.to,
                    severity: 'error',
                    message: msg('widget.codeEditor.eeLint.syntaxError')
                })
            }

        }

        function handleSyntaxError(node) {
            report({
                from: node.from,
                to: node.to,
                severity: 'error',
                message: msg('widget.codeEditor.eeLint.syntaxError')
            })
        }

        function validateFunctionArgCount({node, variableName}) {
            const argListNode = node.node.nextSibling
            const argCount = Math.floor((countChildren(argListNode) - 1) / 2)
            const expectedArgCount = argCountByFunction[variableName]
            if (argCount !== expectedArgCount) {
                report(invalidArgCount(argListNode, {argCount, expectedArgCount}))
            }
        }

        function countChildren(node) {
            const recurse = (node, count) => {
                const nextSibling = node.nextSibling
                return nextSibling
                    ? recurse(nextSibling, ++count)
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
                ? sliceDoc(bandNameNode)
                : nextNode?.name === '['
                    ? sliceDoc(bandNameNode).slice(1, -1)
                    : null
            return {bandName, bandNameNode}
        }

        function handleBandName({variableName, bandName, bandNameNode}) {
            const validBandName = bandsByVariableName[variableName]?.map(({name}) => name)?.includes(bandName)
            if (validBandName) {
                if (!bands.length) {
                    const band = bandsByVariableName[variableName].find(({name}) => name === bandName)
                    bands = [band]
                }
            } else {
                report(invalidBand(bandNameNode, {imageName: variableName, bandName}))
            }
        }

        function validateSyntax() {
            if (diagnostics.length) {
                return
            }
            const expression = view.state.doc.text.join('\n')
            try {
                jsep.parse(expression)
            } catch (error) {
                report({
                    from: error.index,
                    to: Math.min(error.index + 1, expression.length),
                    severity: 'error',
                    message: msg('widget.codeEditor.eeLint.syntaxError')
                })
            }
        }

        function notifyBandNameChanges() {
            if (!bands.length) {
                bands = [{id: 'constant', name: 'constant'}]
            }
            onBandNamesChanged && !_.isEqual(lastBands, bands) && onBandNamesChanged(bands)
            lastBands = bands
        }

        function report(error) {
            const alreadyReported = diagnostics
                .find(({from, to}) => error.to >= from && error.from <= to)
            alreadyReported || diagnostics.push(error)
        }
    }

    function undefinedVariable(node, {variableName}) {
        return ({
            from: node.from,
            to: node.to,
            severity: 'error',
            message: msg('widget.codeEditor.eeLint.undefinedVariable', {variableName})
        })
    }

    function invalidArgCount(node, {argCount, expectedArgCount}) {
        return ({
            from: node.from,
            to: node.to,
            severity: 'error',
            message: msg('widget.codeEditor.eeLint.invalidArgCount', {argCount, expectedArgCount})
        })
    }

    function invalidBand(node, {imageName, bandName}) {
        return ({
            from: node.from,
            to: node.to,
            severity: 'error',
            message: msg('widget.codeEditor.eeLint.invalidBand', {imageName, bandName})
        })
    }

    function invalidBandCount(node, {imageName, bandCount, maxUsedImageBandCount}) {
        return ({
            from: node.from,
            to: node.to,
            severity: 'error',
            message: msg('widget.codeEditor.eeLint.invalidBandCount', {
                imageName,
                expectedBandCount: maxUsedImageBandCount,
                bandCount
            })
        })
    }

}


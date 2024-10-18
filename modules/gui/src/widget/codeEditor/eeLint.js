import {syntaxTree} from '@codemirror/language'
import jsep from 'jsep'
import _ from 'lodash'

import {argCountByFunction, mathOptions} from './mathOptions'

jsep.addBinaryOp('**')
jsep.removeBinaryOp('>>>')
jsep.removeUnaryOp('~')

export const eeLint = (images, msg, onBandNamesChanged) => {
    let lastBandNames = []
    const bandNamesByVariableName = {}
    images.forEach(({name, includedBands}) => bandNamesByVariableName[name] = includedBands.map(({name}) => name))
    mathOptions(msg).forEach(({name}) => bandNamesByVariableName[name] = [])

    return view => {
        const state = view.state
        const diagnostics = []
        let bandNames = []

        syntaxTree(view.state).cursor().iterate(node => {
            if (node.name === 'VariableName') {
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
            const variableBandNames = bandNamesByVariableName[variableName]
            const isValidVariableName = !!variableBandNames

            if (isValidVariableName) {
                if (hasArgList) {
                    validateFunctionArgCount({node, variableName})
                } else {
                    const isMathFunction = Object.keys(argCountByFunction).includes(variableName)
                    if (isMathFunction) { // Math function without arguments
                        diagnostics.push(undefinedVariable(node, {variableName}))
                    }
                }

                const {bandName, bandNameNode} = extractBandName(node)
                if (bandName) {
                    handleBandName({variableName, bandName, bandNameNode})
                } else {
                    if (variableBandNames?.length > bandNames.length) {
                        bandNames = variableBandNames
                    }
                }
            } else {
                diagnostics.push(undefinedVariable(node, {variableName}))
            }
        }

        function handleDotSyntax(node) {
            const prevNodeType = node.node.prevSibling?.name
            const nextNodeType = node.node.nextSibling?.name
            if (prevNodeType !== 'VariableName' || nextNodeType !== 'PropertyName') {
                diagnostics.push({
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
                diagnostics.push({
                    from: node.from,
                    to: node.to,
                    severity: 'error',
                    message: msg('widget.codeEditor.eeLint.syntaxError')
                })
            }

        }

        function validateFunctionArgCount({node, variableName}) {
            const argListNode = node.node.nextSibling
            const argCount = (countChildren(argListNode) - 1) / 2
            const expectedArgCount = argCountByFunction[variableName]
            if (argCount !== expectedArgCount) {
                diagnostics.push(invalidArgCount(argListNode, {argCount, expectedArgCount}))
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
            const validBandName = bandNamesByVariableName[variableName]?.includes(bandName)
            if (validBandName) {
                if (!bandNames.length) {
                    bandNames = [bandName]
                }
            } else {
                diagnostics.push(invalidBand(bandNameNode, {imageName: variableName, bandName}))
            }
        }

        function validateSyntax() {
            const expression = view.state.doc.text.join('\n')
            try {
                jsep.parse(expression)
            } catch (error) {
                const alreadyReported = diagnostics
                    .find(({from, to}) => error.index >= from && error.index <= to)
                alreadyReported || diagnostics.push({
                    from: error.index,
                    to: Math.min(error.index + 1, expression.length),
                    severity: 'error',
                    message: msg('widget.codeEditor.eeLint.syntaxError')
                })
            }
        }

        function notifyBandNameChanges() {
            if (!bandNames.length) {
                bandNames = ['constant']
            }
            onBandNamesChanged && !_.isEqual(lastBandNames, bandNames) && onBandNamesChanged(bandNames)
            lastBandNames = bandNames
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

}


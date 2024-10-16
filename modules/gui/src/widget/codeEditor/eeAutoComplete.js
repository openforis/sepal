import {syntaxTree} from '@codemirror/language'

import {mathOptions} from './mathOptions'

export const eeAutoComplete = (images, msg) =>
    context => {
        const tree = syntaxTree(context.state)
        const beforeNode = tree.resolveInner(context.pos, -1)
        const afterNode = tree.resolveInner(context.pos, 1)

        const autoCompleteVariable = ({from, to}) => {
            const prefix = context.state.sliceDoc(from, context.pos)
            const section = {
                name: msg('widget.codeEditor.eeAutoComplete.imagesAndCalculations.section'),
                rank: 0,
            }
            const imageOptions = images
                .map(image => ({
                    section,
                    label: image.name,
                    type: 'variable'
                }))
                .filter(({label}) => label.startsWith(prefix))
            const options = [
                ...imageOptions,
                ...mathOptions(msg).filter(({label}) =>
                    label.startsWith(prefix) && !imageOptions
                        .find(imageOption => imageOption.label === label.replaceAll('(', ''))
                )
            ]
            return {from, to, filter: false, options}
        }

        const autoCompleteBands = ({variableNameNode, from, to, string = false}) => {
            if (variableNameNode?.name === 'VariableName') {
                const prefix = context.state
                    .sliceDoc(from, context.pos)
                    .replaceAll('"', '\'')
                const variableName = context.state.sliceDoc(variableNameNode.from, variableNameNode.to)
                const image = images.find(({name}) => name === variableName)
                if (!image) {
                    return noSuggestions
                } else {
                    const options = image.includedBands
                        .map(({name}) => ({
                            section: {
                                name: msg('widget.codeEditor.eeAutoComplete.bandNames.section'),
                                rank: 0
                            },
                            label: string ? `'${name}']` : name,
                            displayLabel: name,
                            type: 'property'
                        }))
                        .filter(({label}) => label.startsWith(prefix))
                    return {from, to, filter: false, options}
                }
            } else {
                return noSuggestions
            }
        }

        if (beforeNode.name === '.') {
            return autoCompleteBands({
                variableNameNode: beforeNode.prevSibling,
                from: context.pos,
                to: afterNode.name === 'PropertyName'
                    ? afterNode.to
                    : context.pos
            })
        } else if (beforeNode.name === 'PropertyName') {
            return autoCompleteBands({
                variableNameNode: beforeNode?.prevSibling?.prevSibling,
                from: beforeNode.from,
                to: beforeNode.to
            })
        } else if (beforeNode.name === '[') {
            return autoCompleteBands({
                variableNameNode: beforeNode?.prevSibling,
                from: context.pos,
                to: afterNode.name === 'String'
                    ? afterNode.to
                    : context.pos,
                string: true
            })
        } else if (beforeNode.name === 'String') {
            return autoCompleteBands({
                variableNameNode: beforeNode?.prevSibling?.prevSibling,
                from: beforeNode.from,
                to: beforeNode.to,
                string: true
            })
        } else if (beforeNode.name === 'VariableName') {
            return autoCompleteVariable({
                from: beforeNode.from,
                to: beforeNode.to
            })
        } else if (afterNode.name === 'VariableName') {
            return autoCompleteVariable({
                from: afterNode.from,
                to: afterNode.to
            })
        } else if (beforeNode.name === 'Script' && !beforeNode.childBefore(context.pos)) {
            return autoCompleteVariable({
                from: beforeNode.from,
                to: beforeNode.to
            })
        } else if (allowVarAfter.includes(beforeNode.name)) {
            return autoCompleteVariable({
                from: context.pos,
                to: context.pos
            })
        } else {
            return noSuggestions
        }
    }

const allowVarAfter = [
    '(',
    ',',
    'ArgList',
    'ArithOp',
    'CompareOp',
    'LogicOp',
    'BinaryExpression',
    'ConditionalExpression',
]

const noSuggestions = {options: []}

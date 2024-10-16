import {syntaxTree} from '@codemirror/language'
import jsep from 'jsep'

import {argCountByFunction, mathOptions} from './mathOptions'

export const eeLint = (images, msg) => {
    const variableNames = [
        ...images.map(({name}) => name),
        ...mathOptions(msg).map(({name}) => name)
    ]

    return view => {
        const state = view.state
        const diagnostics = []

        const sliceDoc = node =>
            state.sliceDoc(node.from, node.to)

        syntaxTree(view.state).cursor().iterate(node => {
            // console.log(node.name)
            if (node.name == 'VariableName') {
                const variableName = sliceDoc(node)
                const isFunction = node.node.nextSibling?.name === 'ArgList'
                
                const isValidVariableName = variableNames.includes(variableName)
                if (!isValidVariableName) {
                    diagnostics.push({
                        from: node.from,
                        to: node.to,
                        severity: 'error',
                        message: msg('widget.codeEditor.eeAutoLint.undefinedVariable', {variableName})
                    })
                }

                if (isFunction) {
                    const argListNode = node.node.nextSibling
                    if (argListNode?.name === 'ArgList') {
                        const argCount = (countChildren(argListNode) - 1) / 2
                        const expectedArgCount = argCountByFunction[variableName]
                        if (argCount !== expectedArgCount) {
                            diagnostics.push({
                                from: argListNode.from,
                                to: argListNode.to,
                                severity: 'error',
                                message: msg('widget.codeEditor.eeAutoLint.invalidArgCount', {argCount, expectedArgCount})
                            })
                        }
                    } else {
                        diagnostics.push({
                            from: node.from,
                            to: node.to,
                            severity: 'error',
                            message: msg('widget.codeEditor.eeAutoLint.undefinedVariable', {variableName})
                        })
                    }
                }

            }

        })
        // try {
        //     jsep.parse(view.state.doc.text.join('\n'))
        // } catch(error) {
        //     // TODO: Skip if we already have diagnostics for error.index
        //     console.log('jsep', error.index)
        //     diagnostics.push({
        //         from: error.index,
        //         to: error.index + 1,
        //         severity: 'error',
        //         message: error.description
        //     })
        // }
        return diagnostics
    }
}

const countChildren = node => {
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

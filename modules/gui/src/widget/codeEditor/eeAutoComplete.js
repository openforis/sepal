import {syntaxTree} from '@codemirror/language'

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

export const mathOptions = msg => [
    {section: msg('widget.codeEditor.eeAutoComplete.mathFunctions.section'), label: 'abs(', displayLabel: 'abs(x)', info: 'Returns the absolute value of the input.', type: 'function'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathFunctions.section'), label: 'acos(', displayLabel: 'acos(x)', info: 'Returns the arccosine of the input.', type: 'function'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathFunctions.section'), label: 'asin(', displayLabel: 'asin(x)', info: 'Returns the arcsine of the input.', type: 'function'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathFunctions.section'), label: 'atan(', displayLabel: 'atan(x)', info: 'Returns the arctangent of the input.', type: 'function'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathFunctions.section'), label: 'atan2(', displayLabel: 'atan2(x, y)', info: 'Returns the arctangent of the quotient of its arguments.', type: 'function'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathFunctions.section'), label: 'cbrt(', displayLabel: 'cbrt(x)', info: 'Returns the cube root of the input.', type: 'function'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathFunctions.section'), label: 'ceil(', displayLabel: 'ceil(x)', info: 'Returns the smallest integer greater than or equal to the input.', type: 'function'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathFunctions.section'), label: 'cos(', displayLabel: 'cos(x)', info: 'Returns the cosine of the input.', type: 'function'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathFunctions.section'), label: 'cosh(', displayLabel: 'cosh(x)', info: 'Returns the hyperbolic cosine of the input.', type: 'function'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathFunctions.section'), label: 'exp(', displayLabel: 'exp(x)', info: 'Returns ex, where x is the argument, and e is Euler\'s number (2.718…, the base of the natural logarithm).', type: 'function'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathFunctions.section'), label: 'hypot(', displayLabel: 'hypot(x, y)', info: 'Returns the square root of the sum of squares of its arguments.', type: 'function'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathFunctions.section'), label: 'log(', displayLabel: 'log(x)', info: 'Returns the natural logarithm (㏒e; also, ㏑) of the input.', type: 'function'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathFunctions.section'), label: 'log10(', displayLabel: 'log10(x)', info: 'Returns the base-10 logarithm of the input.', type: 'function'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathFunctions.section'), label: 'max(', displayLabel: 'max(x, y)', info: 'Returns the largest of two numbers.', type: 'function'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathFunctions.section'), label: 'min(', displayLabel: 'min(x, y)', info: 'Returns the smallest of two numbers.', type: 'function'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathFunctions.section'), label: 'pow(', displayLabel: 'pow(x, y)', info: 'Returns base x to the exponent power y (that is, xy).', type: 'function'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathFunctions.section'), label: 'random(', displayLabel: 'random(seed, distribution)', info: 'Generates a random number at each pixel location. When using the \'uniform\' distribution, outputs are in the range of [0, 1). Using the \'normal\' distribution, the outputs have μ=0, σ=1, but no explicit limits.', type: 'function'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathFunctions.section'), label: 'round(', displayLabel: 'round(x)', info: 'Returns the value of the input rounded to the nearest integer.', type: 'function'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathFunctions.section'), label: 'sin(', displayLabel: 'sin(x)', info: 'Returns the sine of the input.', type: 'function'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathFunctions.section'), label: 'sinh(', displayLabel: 'sinh(x)', info: 'Returns the hyperbolic sine of the input.', type: 'function'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathFunctions.section'), label: 'sqrt(', displayLabel: 'sqrt(x)', info: 'Returns the positive square root of the input.', type: 'function'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathFunctions.section'), label: 'tan(', displayLabel: 'tan(x)', info: 'Returns the tangent of the input.', type: 'function'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathFunctions.section'), label: 'tanh(', displayLabel: 'tanh(x)', info: 'Returns the hyperbolic tangent of the input.', type: 'function'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathConstants.section'), label: 'E', info: 'Euler\'s number and the base of natural logarithms; approximately 2.718.', type: 'constant'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathConstants.section'), label: 'LN10', info: 'Natural logarithm of 10; approximately 2.303.', type: 'constant'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathConstants.section'), label: 'LN2', info: 'Natural logarithm of 2; approximately 0.693.', type: 'constant'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathConstants.section'), label: 'LOG10E', info: 'Base-10 logarithm of E; approximately 0.434.', type: 'constant'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathConstants.section'), label: 'LOG2E', info: 'Base-2 logarithm of E; approximately 1.443.', type: 'constant'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathConstants.section'), label: 'PI', info: 'Ratio of a circle\'s circumference to its diameter; approximately 3.14159.', type: 'constant'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathConstants.section'), label: 'SQRT1_2', info: 'Square root of ½; approximately 0.707.', type: 'constant'},
    {section: msg('widget.codeEditor.eeAutoComplete.mathConstants.section'), label: 'SQRT2', info: 'Square root of 2; approximately 1.414.', type: 'constant'},
]

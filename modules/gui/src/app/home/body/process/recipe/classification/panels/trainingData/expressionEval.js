/* eslint-disable no-case-declarations */
import jsep from 'jsep'

/**
 * Evaluation code from JSEP project, under MIT License.
 * Copyright (c) 2013 Stephen Oney, http://jsep.from.so/
 */

const binops = {
    '||': function (a, b) { return a || b },
    '&&': function (a, b) { return a && b },
    '|': function (a, b) { return a | b },
    '^': function (a, b) { return a ^ b },
    '&': function (a, b) { return a & b },
    '==': function (a, b) { return a == b }, // jshint ignore:line
    '!=': function (a, b) { return a != b }, // jshint ignore:line
    '===': function (a, b) { return a === b },
    '!==': function (a, b) { return a !== b },
    '<': function (a, b) { return a < b },
    '>': function (a, b) { return a > b },
    '<=': function (a, b) { return a <= b },
    '>=': function (a, b) { return a >= b },
    '<<': function (a, b) { return a << b },
    '>>': function (a, b) { return a >> b },
    '>>>': function (a, b) { return a >>> b },
    '+': function (a, b) { return a + b },
    '-': function (a, b) { return a - b },
    '*': function (a, b) { return a * b },
    '/': function (a, b) { return a / b },
    '%': function (a, b) { return a % b }
}

const unops = {
    '-': function (a) { return -a },
    '+': function (a) { return +a },
    '~': function (a) { return ~a },
    '!': function (a) { return !a },
}

function evaluate(node, context, options) {
    return evaluateNode(node)

    function evaluateArray(list) {
        return list.map(function (v) {
            return evaluateNode(v)
        })
    }

    function evaluateMember(node) {
        const object = evaluateNode(node.object)
        if (node.computed) {
            const evaluated = evaluateNode(node.property)
            assertInObject(evaluated, object, options)
            return [object, object[evaluated]]
        } else {
            assertInObject(node.property.name, object, options)
            return [object, object[node.property.name]]
        }
    }

    function evaluateNode(node) {
        switch (node.type) {

            case 'ArrayExpression':
                return evaluateArray(node.elements)

            case 'BinaryExpression':
                return binops[node.operator](evaluateNode(node.left), evaluateNode(node.right))

            case 'CallExpression':
                let caller, fn, assign
                if (node.callee.type === 'MemberExpression') {
                    assign = evaluateMember(node.callee)
                    caller = assign[0]
                    fn = assign[1]
                } else {
                    fn = evaluateNode(node.callee)
                }
                if (typeof fn !== 'function') {
                    return undefined
                }
                return fn.apply(caller, evaluateArray(node.arguments))

            case 'ConditionalExpression':
                return evaluateNode(node.test)
                    ? evaluateNode(node.consequent)
                    : evaluateNode(node.alternate)

            case 'Identifier':
                assertInObject(node.name, context, options)
                return context[node.name]

            case 'Literal':
                return node.value

            case 'LogicalExpression':
                if (node.operator === '||') {
                    return evaluateNode(node.left) || evaluateNode(node.right)
                } else if (node.operator === '&&') {
                    return evaluateNode(node.left) && evaluateNode(node.right)
                }
                return binops[node.operator](evaluateNode(node.left), evaluateNode(node.right))

            case 'MemberExpression':
                return evaluateMember(node)[1]

            case 'ThisExpression':
                return context

            case 'UnaryExpression':
                return unops[node.operator](evaluateNode(node.argument))

            default:
                return undefined
        }
    }
}

async function evalAsync(node, context, options) {
    return await evaluateNode(node)

    async function evaluateArray(list) {
        const res = await Promise.all(list.map(v => evaluateNode(v)))
        return res
    }

    async function evaluateMember(node) {
        const object = await evaluateNode(node.object)
        if (node.computed) {
            const evaluated = await evaluateNode(node.property)
            assertInObject(evaluated, object, options)
            return [object, object[evaluated]]
        } else {
            assertInObject(node.property.name, object, options)
            return [object, object[node.property.name]]
        }
    }

    async function evaluateNode(node) {
        switch (node.type) {

            case 'ArrayExpression':
                return await evaluateArray(node.elements)

            case 'BinaryExpression': {
                const [left, right] = await Promise.all([
                    evaluateNode(node.left),
                    evaluateNode(node.right)
                ])
                return binops[node.operator](left, right)
            }

            case 'CallExpression':
                let caller, fn, assign
                if (node.callee.type === 'MemberExpression') {
                    assign = await evaluateMember(node.callee)
                    caller = assign[0]
                    fn = assign[1]
                } else {
                    fn = await evaluateNode(node.callee)
                }
                if (typeof fn !== 'function') {
                    return undefined
                }
                return await fn.apply(
                    caller,
                    await evaluateArray(node.arguments)
                )

            case 'ConditionalExpression':
                return (await evaluateNode(node.test))
                    ? await evaluateNode(node.consequent)
                    : await evaluateNode(node.alternate)

            case 'Identifier':
                assertInObject(node.name, context, options)
                return context[node.name]

            case 'Literal':
                return node.value

            case 'LogicalExpression': {
                if (node.operator === '||') {
                    return (
                        (await evaluateNode(node.left)) || (await evaluateNode(node.right))
                    )
                } else if (node.operator === '&&') {
                    return (
                        (await evaluateNode(node.left)) && (await evaluateNode(node.right))
                    )
                }

                const [left, right] = await Promise.all([
                    evaluateNode(node.left),
                    evaluateNode(node.right)
                ])

                return binops[node.operator](left, right)
            }

            case 'MemberExpression':
                return (await evaluateMember(node))[1]

            case 'ThisExpression':
                return context

            case 'UnaryExpression':
                return unops[node.operator](await evaluateNode(node.argument))

            default:
                return undefined
        }
    }
}

function compile(expression) {
    return evaluate.bind(null, jsep(expression))
}

function compileAsync(expression) {
    return evalAsync.bind(null, jsep(expression))
}

// Added functions to inject Custom Unary Operators (and override existing ones)
function addUnaryOp(operator, _function) {
    jsep.addUnaryOp(operator)
    unops[operator] = _function
}

// Added functions to inject Custom Binary Operators (and override existing ones)
function addBinaryOp(operator, _function) {
    jsep.addBinaryOp(operator)
    binops[operator] = _function
}

function assertInObject(name, object, options = {strict: false}) {
    if (options.strict && !Object.keys(object).includes(name)) {
        throw new Error(`${name} is not defined`)
    }
}

export {
    addBinaryOp,
    addUnaryOp,
    compile,
    compileAsync,
    evaluate as eval,
    evalAsync,
    jsep as parse}

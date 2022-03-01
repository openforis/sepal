import {eval as evaluate, parse} from './expressionEval'

const MATH = {
    E: Math.E, LN10: Math.LN10, LN2: Math.LN2, LOG10E: Math.LOG10E, LOG2E: Math.LOG2E, PI: Math.PI,
    SQRT1_2: Math.SQRT1_2, SQRT2: Math.SQRT2, abs: Math.abs,
    acos: Math.acos, acosh: Math.acosh, asin: Math.asin, asinh: Math.asinh,
    atan: Math.atan, atan2: Math.atan2, atanh: Math.atanh,
    cbrt: Math.cbrt, ceil: Math.ceil, clz32: Math.clz32, cos: Math.cos, cosh: Math.cosh,
    exp: Math.exp, expm1: Math.expm1, floor: Math.floor, fround: Math.fround, hypot: Math.hypot, imul: Math.imul,
    log: Math.log, log10: Math.log10, log1p: Math.log1p, log2: Math.log2, max: Math.max, min: Math.min,
    pow: Math.pow, random: Math.random, round: Math.round, sign: Math.sign, sin: Math.sin, sinh: Math.sinh,
    sqrt: Math.sqrt, tan: Math.tan, tanh: Math.tanh, trunc: Math.trunc}

export const validateExpression = ({expression, rows}) => {
    rows.forEach(row => evaluateRow({expression, row}))
}

export const evaluateRow = ({expression, row}) => {
    const ast = parse(expression)
    const context = {...row, columns: {...row}, ...MATH}
    return evaluate(ast, context, {strict: true})
}

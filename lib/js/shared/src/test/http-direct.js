const testHttpDirect$ = require('./http/test')

module.exports = ({params: {min, max, errorProbability}}) =>
    testHttpDirect$(parseInt(min), parseInt(max), parseInt(errorProbability), {initArgs: {mode: 'Direct'}})

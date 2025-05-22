const testHttpDirect$ = require('./http/worker')

module.exports = ({params: {min, max, errorProbability}}) =>
    testHttpDirect$({
        requestArgs: {
            minDuration: parseInt(min),
            maxDuration: parseInt(max),
            errorProbability: parseInt(errorProbability)
        },
        initArgs: {mode: 'Direct'},
        state: {}
    })

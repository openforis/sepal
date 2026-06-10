import testHttpDirect$ from './http/worker.js'

export default ({params: {min, max, errorProbability}}) =>
    testHttpDirect$({
        requestArgs: {
            minDuration: parseInt(min),
            maxDuration: parseInt(max),
            errorProbability: parseInt(errorProbability)
        },
        initArgs: {mode: 'Direct'},
        state: {}
    })

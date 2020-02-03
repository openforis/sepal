module.exports = port => {
    const level = level =>
        (...args) => port.postMessage({log: {level, args}})

    return {
        trace: level('trace'),
        debug: level('debug'),
        info: level('info'),
        warn: level('warn'),
        error: level('error'),
        fatal: level('fatal')
    }
}

const requireOnce = name => {
    const KEY = Symbol.for(`Sepal.requireOnce(${name})`)
    var globalSymbols = Object.getOwnPropertySymbols(global)
    var hasRequired = globalSymbols.indexOf(KEY) > -1
    if (!hasRequired) {
        const ee = require(name)
        require('./extensions')(ee)
        global[KEY] = ee
    }
    return global[KEY]
}

module.exports = requireOnce('@google/earthengine')

module.exports = {
    requireOnce: (name, callback) => {
        const KEY = Symbol.for(`Sepal.requireOnce(${name})`)
        var globalSymbols = Object.getOwnPropertySymbols(global)
        var hasRequired = globalSymbols.indexOf(KEY) > -1
        if (!hasRequired) {
            const module = require(name)
            global[KEY] = module
            callback && callback(module)
        }
        return global[KEY]
    }
}

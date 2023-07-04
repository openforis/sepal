const requireOnce = (name, callback) => {
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

const toPromise = async func =>
    new Promise((resolve, reject) => {
        try {
            func((error, ...result) => {
                if (error) {
                    reject(error)
                } else {
                    resolve(result)
                }
            })
        } catch (error) {
            reject(error)
        }
    })

module.exports = {
    requireOnce,
    toPromise
}

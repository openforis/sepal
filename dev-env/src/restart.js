import {getModules} from './utils.js'
import {startModule} from './start.js'
import {stopModule} from './stop.js'

export const restart = async (modules, options) => {
    for (const module of getModules(modules)) {
        await stopModule(module, options)
        await startModule(module, options)
    }
}

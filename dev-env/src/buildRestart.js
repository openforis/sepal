import {build} from './build.js'
import {restart} from './restart.js'

export const buildRestart = async (module, options) => {
    await build(module, options)
    await restart(module, options)
}

import {build} from './build.js'
import {restart} from './restart.js'
import {logs} from './logs.js'

export const run = async (module, options) => {
    if (options.build) {
        await build(module, {cache: true}) 
    }
    await restart(module, options) 
    await logs(module, {follow: true})
}

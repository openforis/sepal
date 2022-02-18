import {build} from './build.js'
import {start} from './start.js'
import {logs} from './logs.js'

export const run = async (module, options) => {
    if (options.build) {
        await build(module, {cache: true}) 
    }
    await start(module, {stop: true}) 
    await logs(module, {follow: true})
}

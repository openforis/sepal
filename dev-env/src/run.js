import {start} from './start.js'
import {logs} from './logs.js'

export const run = async (module, options) => {
    await start(module, {stop: true}) 
    await logs(module, {follow: true})
}

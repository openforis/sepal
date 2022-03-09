import {stop} from './stop.js'
import {start} from './start.js'

export const restart = async (module, options) => {
    await stop(module, options)
    await start(module, options)
}

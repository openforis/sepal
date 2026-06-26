import {start} from './start.js'
import {stop} from './stop.js'

export const restart = async (module, options) => {
    await stop(module, options)
    await start(module, options)
}

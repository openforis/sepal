import {start} from './start.js'

export const restart = async (module, options) => {
    await start(module, {...options, stop: true, stopDependencies: options.dependencies}) 
}

import {setWorkloadTag} from '../workloadTag.js'
import {exportRandomToAssets$} from './randomExport.js'
import {exportSystematicToAssets$} from './systematicExport.js'

// TODO: SEPAL export is unfinished - the 'SEPAL' destination routes through
// tableToSepal$, which is still a stub. Format/parameters need to be defined.
export const submit$ = (taskId, {description, properties, recipe, assetId, strategy}) => {
    setWorkloadTag(recipe)
    const {model: {sampleArrangement}} = recipe
    switch (sampleArrangement.arrangementStrategy) {
        case 'SYSTEMATIC': return exportSystematicToAssets$({taskId, description, recipe, assetId, strategy, properties, destination: 'SEPAL'})
        case 'RANDOM': return exportRandomToAssets$({taskId, description, recipe, assetId, strategy, properties, destination: 'SEPAL'})
        default: throw Error(`Unsupported sample arrangement strategy: ${sampleArrangement.arrangementStrategy}`)
    }
}

import {setWorkloadTag} from '../workloadTag.js'
import {exportRandomToAssets$} from './randomExport.js'
import {exportSystematicToAssets$} from './systematicExport.js'

export const submit$ = (taskId, {description, properties, recipe, assetId, strategy}) => {
    setWorkloadTag(recipe)
    const {model: {sampleArrangement}} = recipe
    switch (sampleArrangement.arrangementStrategy) {
        case 'SYSTEMATIC': return exportSystematicToAssets$({taskId, description, recipe, assetId, strategy, properties, destination: 'ASSET'})
        case 'RANDOM': return exportRandomToAssets$({taskId, description, recipe, assetId, strategy, properties, destination: 'ASSET'})
        default: throw Error(`Unsupported sample arrangement strategy: ${sampleArrangement.arrangementStrategy}`)
    }
}

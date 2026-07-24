import {sanitizeEarthEngineAssetId, sanitizeEarthEngineTaskName} from '#sepal/earthEngineExportNames'

import {setWorkloadTag} from '../workloadTag.js'
import {exportRandomToAssets$} from './randomExport.js'
import {exportSystematicToAssets$} from './systematicExport.js'

export const submit$ = (taskId, {description, properties, recipe, assetId, strategy}) => {
    setWorkloadTag(recipe)
    const {model: {sampleArrangement}} = recipe
    const exportOptions = {
        taskId,
        description: sanitizeEarthEngineTaskName(description, 'Sampling_design'),
        recipe,
        assetId: sanitizeEarthEngineAssetId(assetId),
        strategy,
        properties,
        destination: 'ASSET'
    }
    switch (sampleArrangement.arrangementStrategy) {
        case 'SYSTEMATIC': return exportSystematicToAssets$(exportOptions)
        case 'RANDOM': return exportRandomToAssets$(exportOptions)
        default: throw Error(`Unsupported sample arrangement strategy: ${sampleArrangement.arrangementStrategy}`)
    }
}

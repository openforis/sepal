import {sanitizeEarthEngineTaskName} from '#sepal/earthEngineExportNames'

import {setWorkloadTag} from '../workloadTag.js'
import {exportRandomToAssets$} from './randomExport.js'
import {exportSystematicToAssets$} from './systematicExport.js'

// SEPAL table export: the retrieve options (workspacePath, filenamePrefix, fileFormat) are spread into
// the task params and threaded through to the exporters, which hand them to tableToSepal$.
export const submit$ = (taskId, {description, properties, recipe, workspacePath, filenamePrefix, fileFormat}) => {
    setWorkloadTag(recipe)
    const {model: {sampleArrangement}} = recipe
    const safeDescription = sanitizeEarthEngineTaskName(description, 'Sampling_design')
    const sepal = {
        taskId,
        description: safeDescription,
        recipe,
        properties,
        destination: 'SEPAL',
        workspacePath,
        filenamePrefix: sanitizeEarthEngineTaskName(filenamePrefix || safeDescription, safeDescription),
        fileFormat
    }
    switch (sampleArrangement.arrangementStrategy) {
        case 'SYSTEMATIC': return exportSystematicToAssets$(sepal)
        case 'RANDOM': return exportRandomToAssets$(sepal)
        default: throw Error(`Unsupported sample arrangement strategy: ${sampleArrangement.arrangementStrategy}`)
    }
}

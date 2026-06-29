import {setWorkloadTag} from '../workloadTag.js'
import {exportRandomToAssets$} from './randomExport.js'
import {exportSystematicToAssets$} from './systematicExport.js'

// SEPAL table export: the retrieve options (workspacePath, filenamePrefix, fileFormat) are spread into
// the task params and threaded through to the exporters, which hand them to tableToSepal$.
export const submit$ = (taskId, {description, properties, recipe, workspacePath, filenamePrefix, fileFormat}) => {
    setWorkloadTag(recipe)
    const {model: {sampleArrangement}} = recipe
    const sepal = {destination: 'SEPAL', workspacePath, filenamePrefix, fileFormat}
    switch (sampleArrangement.arrangementStrategy) {
        case 'SYSTEMATIC': return exportSystematicToAssets$({taskId, description, recipe, properties, ...sepal})
        case 'RANDOM': return exportRandomToAssets$({taskId, description, recipe, properties, ...sepal})
        default: throw Error(`Unsupported sample arrangement strategy: ${sampleArrangement.arrangementStrategy}`)
    }
}

const {setWorkloadTag} = require('../workloadTag')
const {exportSystematicToAssets} = require('./systematicExport')
const {exportRandomToAssets} = require('./randomExport')

module.exports = {
    submit$: (taskId, {workspacePath, description, ...retrieveOptions}) => {
        // TODO: Figure out the parameters for sepal export. We need format for instance
        setWorkloadTag(recipe)
        const {model: {sampleArrangement}} = recipe
        
        switch (sampleArrangement.strategy) {
        case 'SYSTEMATIC': return exportSystematicToAssets({taskId, description, recipe, assetId, strategy})
        case 'RANDOM': return exportRandomToAssets({taskId, description, recipe, assetId, strategy})
        }
    }
}

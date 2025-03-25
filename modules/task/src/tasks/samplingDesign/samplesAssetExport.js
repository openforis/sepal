const {setWorkloadTag} = require('../workloadTag')
const {exportSystematicToAssets} = require('./systematicAssetExport')
const {exportRandomToAssets} = require('./randomAssetExport')

module.exports = {
    submit$: (taskId, {description, recipe, assetId, strategy}) => {
        setWorkloadTag(recipe)
        const {model: {sampleArrangement}} = recipe
        
        switch (sampleArrangement.strategy) {
        case 'SYSTEMATIC': return exportSystematicToAssets({taskId, description, recipe, assetId, strategy})
        case 'RANDOM': return exportRandomToAssets({taskId, description, recipe, assetId, strategy})
        }
    }
}

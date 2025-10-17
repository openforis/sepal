const ImageFactory = require('sepal/src/ee/imageFactory')
const { toGeometry$ } = require('#sepal/ee/aoi')
const { setWorkloadTag } = require('../workloadTag')
const { exportSystematicToAssets$ } = require('./systematicExport')
const { exportRandomToAssets$ } = require('./randomExport')

module.exports = {
    submit$: (taskId, { description, properties, recipe, assetId, strategy }) => {
        setWorkloadTag(recipe)
        const { model: { sampleArrangement } } = recipe

        switch (sampleArrangement.arrangementStrategy) {
            case 'SYSTEMATIC': return exportSystematicToAssets$({ taskId, description, recipe, assetId, strategy, properties, destination: 'ASSET' })
            case 'RANDOM': return exportRandomToAssets$({ taskId, description, recipe, assetId, strategy, properties, destination: 'ASSET' })
            default: throw Error(`Unsupported sample arrangement strategy: ${sampleArrangement.arrangementStrategy}`)
        }
    }
}

import {retrieveTask} from '~/app/home/body/process/recipe/asset/assetRecipe'
import {MosaicRetrievePanel} from '~/app/home/body/process/recipe/mosaic/panels/retrieve/retrievePanel'

export const Retrieve = () =>
    <MosaicRetrievePanel
        defaultScale={20}
        toSepal
        toData
        toEE
        toDrive
        task={retrieveTask}
    />

Retrieve.propTypes = {}

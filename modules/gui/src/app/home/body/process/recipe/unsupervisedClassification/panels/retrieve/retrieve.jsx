import {MosaicRetrievePanel} from '~/app/home/body/process/recipe/mosaic/panels/retrieve/retrievePanel'
import {retrieveTask} from '~/app/home/body/process/recipe/unsupervisedClassification/unsupervisedClassificationRecipe'

export const Retrieve = () =>
    <MosaicRetrievePanel
        defaultScale={30}
        toSepal
        toEE
        toDrive
        allBands
        task={retrieveTask}
    />

Retrieve.propTypes = {}

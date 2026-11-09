import {retrieveTask} from '~/app/home/body/process/recipe/regression/regressionRecipe'
import {MosaicRetrievePanel} from '~/app/home/body/process/recipe/retrieve/retrievePanel'

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

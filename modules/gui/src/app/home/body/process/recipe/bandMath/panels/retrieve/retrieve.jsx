import {retrieveTask} from '~/app/home/body/process/recipe/bandMath/bandMathRecipe'
import {MosaicRetrievePanel} from '~/app/home/body/process/recipe/mosaic/panels/retrieve/retrievePanel'

// What Band Math offers and exports is its output as the common read answers it, in its output's order.
export const Retrieve = () =>
    <MosaicRetrievePanel
        defaultScale={30}
        toSepal
        toEE
        toDrive
        task={retrieveTask}
    />

Retrieve.propTypes = {}

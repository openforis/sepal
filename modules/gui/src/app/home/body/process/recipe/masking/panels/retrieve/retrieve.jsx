import {retrieveTask} from '~/app/home/body/process/recipe/masking/maskingRecipe'
import {MosaicRetrievePanel} from '~/app/home/body/process/recipe/mosaic/panels/retrieve/retrievePanel'

// What Masking offers and exports is its output as the common read answers it: its source's, through its
// declaration, or - over a source that declares nothing - the names its evidence lifecycle observed.
export const Retrieve = () =>
    <MosaicRetrievePanel
        defaultScale={30}
        toSepal
        toEE
        toDrive
        task={retrieveTask}
    />

Retrieve.propTypes = {}

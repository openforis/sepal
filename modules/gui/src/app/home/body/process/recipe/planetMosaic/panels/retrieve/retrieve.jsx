import React from 'react'

import {MosaicRetrievePanel} from '~/app/home/body/process/recipe/mosaic/panels/retrieve/retrievePanel'
import {groupedBandPresentation} from '~/app/home/body/process/recipe/planetMosaic/bands'
import {retrieveTask} from '~/app/home/body/process/recipe/planetMosaic/planetMosaicRecipe'

export class Retrieve extends React.Component {
    render() {
        return (
            <MosaicRetrievePanel
                bandOptions={groupedBandPresentation()}
                defaultScale={3}
                ticks={[3, 5, 10, 30, 100]}
                toSepal
                toEE
                toDrive
                task={retrieveTask}
            />
        )
    }
}

Retrieve.propTypes = {}

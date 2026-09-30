import React from 'react'

import {MosaicRetrievePanel} from '~/app/home/body/process/recipe/mosaic/panels/retrieve/retrievePanel'
import {groupedBandPresentation} from '~/app/home/body/process/recipe/phenology/bands'
import {retrieveTask} from '~/app/home/body/process/recipe/phenology/phenologyRecipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'

import styles from './retrieve.module.css'

const mapRecipeToProps = recipe => ({recipe})

class _Retrieve extends React.Component {
    render() {
        return (
            <MosaicRetrievePanel
                className={styles.panel}
                bandOptions={this.bandOptions()}
                defaultScale={30}
                toSepal
                toEE
                toDrive
                task={retrieveTask}
            />
        )
    }

    bandOptions() {
        return groupedBandPresentation()
    }
}

export const Retrieve = compose(
    _Retrieve,
    withRecipe(mapRecipeToProps)
)
    
Retrieve.propTypes = {}

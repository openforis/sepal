import React from 'react'

import {getGroupedBandOptions} from '~/app/home/body/process/recipe/baytsAlerts/bands'
import {retrieveTask} from '~/app/home/body/process/recipe/baytsAlerts/baytsAlertsRecipe'
import {MosaicRetrievePanel} from '~/app/home/body/process/recipe/mosaic/panels/retrieve/retrievePanel'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'

import styles from './retrieve.module.css'

const mapRecipeToProps = recipe => ({recipe})

class _Retrieve extends React.Component {
    render() {
        return (
            <MosaicRetrievePanel
                className={styles.panel}
                bandOptions={getGroupedBandOptions()}
                defaultScale={10}
                toSepal
                toEE
                toDrive
                task={retrieveTask}
            />
        )
    }
}

export const Retrieve = compose(
    _Retrieve,
    withRecipe(mapRecipeToProps)
)

Retrieve.propTypes = {}

import {MosaicRetrievePanel} from '~/app/home/body/process/recipe/mosaic/panels/retrieve/retrievePanel'
import {RecipeActions} from '~/app/home/body/process/recipe/baytsAlerts/baytsAlertsRecipe'
import {compose} from '~/compose'
import {getGroupedBandOptions} from '~/app/home/body/process/recipe/baytsAlerts/bands'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import React from 'react'
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
                onRetrieve={retrieveOptions => this.retrieve(retrieveOptions)}
            />
        )
    }

    retrieve(retrieveOptions) {
        const {recipeId} = this.props
        return RecipeActions(recipeId).retrieve(retrieveOptions)
    }
}

export const Retrieve = compose(
    _Retrieve,
    withRecipe(mapRecipeToProps)
)

Retrieve.propTypes = {}

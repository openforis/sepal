import {Retrieve} from './retrieve/retrieve'
import {RetrieveButton} from '../../retrieveButton'
import {Toolbar} from 'widget/toolbar/toolbar'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {setInitialized} from '../../../recipe'
import {withRecipe} from 'app/home/body/process/recipeContext'
import Aoi from 'app/home/body/process/recipe/mosaic/panels/aoi/aoi'
import AssetDetails from './assetDetails/assetDetails'
import Composite from './composite/composite'
import Dates from './dates/dates'
import PanelWizard from 'widget/panelWizard'
import React from 'react'
import styles from './assetToolbar.module.css'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    initialized: selectFrom(recipe, 'ui.initialized'),
    collection: selectFrom(recipe, 'model.assetDetails.type') === 'ImageCollection'
})

class AssetToolbar extends React.Component {
    render() {
        const {recipeId, initialized, collection} = this.props
        return (
            <PanelWizard
                panels={['assetDetails']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>

                <Retrieve/>

                <AssetDetails/>
                <Aoi assetBounds/>
                {collection ? <Dates/> : null}
                {collection ? <Composite/> : null}

                <Toolbar
                    vertical
                    placement='top-right'
                    panel
                    className={styles.top}>
                    <RetrieveButton/>
                </Toolbar>
                <Toolbar
                    vertical
                    placement='bottom-right'
                    panel
                    className={styles.bottom}>
                    <Toolbar.ActivationButton
                        id='assetDetails'
                        label={msg('process.asset.panel.assetDetails.button')}
                        tooltip={msg('process.asset.panel.assetDetails.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id='aoi'
                        label={msg('process.mosaic.panel.areaOfInterest.button')}
                        tooltip={msg('process.mosaic.panel.areaOfInterest.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id='dates'
                        label={msg('process.asset.panel.dates.button')}
                        tooltip={msg('process.asset.panel.dates.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id='filter'
                        label={msg('process.asset.panel.filter.button')}
                        tooltip={msg('process.asset.panel.filter.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id='mask'
                        label={msg('process.asset.panel.mask.button')}
                        tooltip={msg('process.asset.panel.mask.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id='composite'
                        label={msg('process.asset.panel.composite.button')}
                        tooltip={msg('process.asset.panel.composite.tooltip')}
                        disabled={!initialized}/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

export default compose(
    AssetToolbar,
    withRecipe(mapRecipeToProps)
)

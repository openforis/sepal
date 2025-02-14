import React from 'react'

import {Aoi} from '~/app/home/body/process/recipe/mosaic/panels/aoi/aoi'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {PanelWizard} from '~/widget/panelWizard'
import {Toolbar} from '~/widget/toolbar/toolbar'

import {setInitialized} from '../../../recipe'
import {RetrieveButton} from '../../retrieveButton'
import {AssetDetails} from './assetDetails/assetDetails'
import styles from './assetToolbar.module.css'
import {Composite} from './composite/composite'
import {Dates} from './dates/dates'
import {Filter} from './filter/filter'
import {Mask} from './mask/mask'
import {Retrieve} from './retrieve/retrieve'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    initialized: selectFrom(recipe, 'ui.initialized'),
    collection: selectFrom(recipe, 'model.assetDetails.type') === 'ImageCollection'
})

class _AssetToolbar extends React.Component {
    render() {
        const {recipeId, initialized, collection} = this.props
        return (
            <PanelWizard
                panels={['aoi', 'assetDetails']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>

                <Retrieve/>

                <Aoi assetBounds/>
                <AssetDetails/>
                {collection ? <Dates/> : null}
                {collection ? <Filter/> : null}
                <Mask/>
                {collection ? <Composite/> : null}

                <Toolbar
                    vertical
                    placement='top-right'
                    className={styles.top}>
                    <RetrieveButton/>
                </Toolbar>
                <Toolbar
                    vertical
                    placement='bottom-right'
                    className={styles.bottom}>
                    <Toolbar.ActivationButton
                        id='aoi'
                        label={msg('process.mosaic.panel.areaOfInterest.button')}
                        tooltip={msg('process.mosaic.panel.areaOfInterest.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='assetDetails'
                        label={msg('process.asset.panel.assetDetails.button')}
                        tooltip={msg('process.asset.panel.assetDetails.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='dates'
                        label={msg('process.asset.panel.dates.button')}
                        tooltip={msg('process.asset.panel.dates.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='filter'
                        label={msg('process.asset.panel.filter.button')}
                        tooltip={msg('process.asset.panel.filter.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='mask'
                        label={msg('process.asset.panel.mask.button')}
                        tooltip={msg('process.asset.panel.mask.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='composite'
                        label={msg('process.asset.panel.composite.button')}
                        tooltip={msg('process.asset.panel.composite.tooltip')}
                        disabled={!initialized}
                        panel/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

export const AssetToolbar = compose(
    _AssetToolbar,
    withRecipe(mapRecipeToProps)
)

import {Content, SectionLayout} from 'widget/sectionLayout'
import {defaultModel} from './radarMosaicRecipe'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import AoiLayer from '../mosaic/aoiLayer'
import BandSelection from './bandSelection'
import MapToolbar from 'app/home/map/mapToolbar'
import MosaicPreview from './radarMosaicPreview'
import RadarMosaicToolbar from './radarMosaicToolbar'
import React from 'react'
import styles from './radarMosaic.module.css'

const mapRecipeToProps = recipe => ({
    recipeId: selectFrom(recipe, 'id'),
    initialized: selectFrom(recipe, 'ui.initialized'),
})

class RadarMosaic extends React.Component {
    render() {
        const {recipeId, recipeContext: {statePath}, initialized} = this.props
        return (
            <SectionLayout>
                <Content>
                    <div className={styles.radarMosaic}>
                        <MapToolbar statePath={statePath + '.ui'} mapContext={recipeId} labelLayerIndex={1}/>
                        <RadarMosaicToolbar/>
                        <AoiLayer/>
                        {initialized
                            ? <React.Fragment>
                                <MosaicPreview/>
                                <BandSelection/>
                            </React.Fragment>
                            : null}
                    </div>
                </Content>
            </SectionLayout>
        )
    }
}

RadarMosaic.propTypes = {}

export default (
    recipe({defaultModel, mapRecipeToProps})(
        RadarMosaic
    )
)

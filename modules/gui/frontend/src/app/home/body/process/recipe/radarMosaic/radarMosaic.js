import {Content, SectionLayout} from 'widget/sectionLayout'
import {compose} from 'compose'
import {defaultModel} from './radarMosaicRecipe'
import {msg} from 'translate'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import {setAoiLayer} from 'app/home/map/aoiLayer'
import BandSelection from './bandSelection'
import MapScale from 'app/home/map/mapScale'
import MapToolbar from 'app/home/map/mapToolbar'
import MosaicPreview from './radarMosaicPreview'
import RadarMosaicToolbar from './panels/radarMosaicToolbar'
import React from 'react'
import styles from './radarMosaic.module.css'

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized'),
    aoi: selectFrom(recipe, 'model.aoi')
})

class _RadarMosaic extends React.Component {
    render() {
        const {recipeContext: {statePath}, initialized} = this.props
        return (
            <SectionLayout>
                <Content>
                    <div className={styles.radarMosaic}>
                        <MapToolbar statePath={[statePath, 'ui']} labelLayerIndex={3}/>
                        <MapScale/>
                        <RadarMosaicToolbar/>
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

    componentDidMount() {
        const {mapContext: {sepalMap}, aoi} = this.props
        setAoiLayer({
            sepalMap,
            aoi,
            // destroy$: componentWillUnmount$, [TODO] check
            onInitialized: () => sepalMap.fitLayer('aoi')
        })
    }
}

const RadarMosaic = compose(
    _RadarMosaic,
    recipe({defaultModel, mapRecipeToProps})
)

export default () => ({
    id: 'RADAR_MOSAIC',
    labels: {
        name: msg('process.radarMosaic.create'),
        creationDescription: msg('process.radarMosaic.description'),
        tabPlaceholder: msg('process.radarMosaic.tabPlaceholder'),
    },
    components: {
        recipe: RadarMosaic
    }
})

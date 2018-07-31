import api from 'backend'
import React from 'react'
import {connect} from 'store'
import {recipePath} from '../classification/classificationRecipe'
import LandCoverToolbar from './landCoverToolbar'
import MapToolbar from 'app/home/map/mapToolbar'

class LandCover extends React.Component {

    classify() {
        this.props.asyncActionBuilder('CLASSIFY',
            api.tasks.submit$({
                operation: 'sepal.landcover.create_land_cover_map',
                params: {
                    assetPath: 'land-cover-test/myanmar',
                    scale: 3000,
                    years: {
                        2015: {
                            trainingDataFusionTables: {
                                primitiveA: '1kprIURiogZxAKo2Dmvnt5RVEiN0FuuPNUR4Z4COD',
                                primitiveB: '1kprIURiogZxAKo2Dmvnt5RVEiN0FuuPNUR4Z4COD',
                            }
                        },
                        2016: {
                            trainingDataFusionTables: {
                                primitiveA: '1kprIURiogZxAKo2Dmvnt5RVEiN0FuuPNUR4Z4COD',
                                primitiveB: '1kprIURiogZxAKo2Dmvnt5RVEiN0FuuPNUR4Z4COD',
                            }
                        }
                    }
                }
            })
        ).dispatch()
    }

    assessAccuracy() {
        this.props.asyncActionBuilder('ASSES_ACCURACY',
            api.tasks.submit$({
                operation: 'sepal.landcover.assess_land_cover_map_accuracy',
                params: {}
            })
        ).dispatch()
    }

    render() {
        const {recipeId} = this.props
        return (
            <React.Fragment>
                <MapToolbar
                    statePath={recipePath(recipeId, 'ui')}
                    mapContext={recipeId}
                    labelLayerIndex={1}/>
                <LandCoverToolbar recipeId={recipeId}/>
            </React.Fragment>
        )
    }
}

export default connect()(LandCover)
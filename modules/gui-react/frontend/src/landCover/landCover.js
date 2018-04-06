import React from 'react'
import {connect} from 'store'
import Http from 'http-client'

class LandCover extends React.Component {
    createComposites() {
        this.props.asyncActionBuilder('CREATE_COMPOSITES',
            Http.postJson$('/api/tasks', {
                operation: 'sepal.landcover.create_composites',
                params: {
                    assetPath: 'land-cover-test/myanmar',
                    fromYear: 2015,
                    toYear: 2016,
                    aoiFusionTable: '15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F',
                    keyColumn: 'ISO',
                    keyValue: 'MMR',
                    sensors: ['L8', 'L7'],
                    scale: 3000
                }
            })
        ).dispatch()
    }

    classify() {
        this.props.asyncActionBuilder('CLASSIFY',
            Http.postJson$('/api/tasks', {
                operation: 'sepal.landcover.create_land_cover_map',
                params: {
                    assetPath: 'land-cover-test/myanmar',
                    scale: 3000,
                    years: {
                        // 2015: {
                        //     trainingDataFusionTables: {
                        //         primitiveA: '1kprIURiogZxAKo2Dmvnt5RVEiN0FuuPNUR4Z4COD',
                        //         primitiveB: '1kprIURiogZxAKo2Dmvnt5RVEiN0FuuPNUR4Z4COD',
                        //     }
                        // },
                        2016: {
                            trainingDataFusionTables: {
                                primitiveA: '1kprIURiogZxAKo2Dmvnt5RVEiN0FuuPNUR4Z4COD',
                                // primitiveB: '1kprIURiogZxAKo2Dmvnt5RVEiN0FuuPNUR4Z4COD',
                            }
                        }
                    }
                }
            })
        ).dispatch()
    }

    assessAccuracy() {
        this.props.asyncActionBuilder('ASSES_ACCURACY',
            Http.postJson$('/api/tasks', {
                operation: 'sepal.landcover.assess_land_cover_map_accuracy',
                params: {}
            })
        ).dispatch()
    }

    // Find out which step
    //      Start with a recipe step, then validate that expected assets and fusion tables are available

    // Get the task id, and use it to monitor state

    render() {
        return (
            <div>
                <button onClick={this.createComposites.bind(this)}>Create composites</button>
                <br/><br/>
                <button onClick={this.classify.bind(this)}>Classify</button>
                <br/><br/>
                <button onClick={this.assessAccuracy.bind(this)}>Assess accuracy</button>
            </div>
        )
    }
}

export default connect()(LandCover)
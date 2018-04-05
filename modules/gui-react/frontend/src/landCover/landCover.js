import React from 'react'
import {connect} from 'store'
import Http from 'http-client'

class LandCover extends React.Component {
    createComposites() {
        this.props.asyncActionBuilder('CREATE_COMPOSITES',
            Http.postJson$('/api/tasks', {
                operation: 'sepal.landcover.create_composites',
                params: {
                    name: 'foo-composite',
                    fromYear: 2015,
                    toYear: 2016,
                    aoiFusionTable: '15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F',
                    keyColumn: 'ISO',
                    keyValue: 'MMR',
                    sensors: ['L8', 'L7'],
                    scale: 300
                }
            })
        ).dispatch()
    }

    classify() {
        this.props.asyncActionBuilder('CLASSIFY',
            Http.postJson$('/api/tasks', {
                operation: 'sepal.landcover.create_land_cover_map',
                params: {
                    trainingDataFusionTables: {
                        primitiveA: '1l97evnBiO9sYaKsPAuG5Gte-scimrRLPDwScW1Se',
                        primitiveB: '1l97evnBiO9sYaKsPAuG5Gte-scimrRLPDwScW1Se',
                    },
                    compositePaths: [
                        'foo-composite-2015',
                        'foo-composite-2016'
                    ]
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

    useMyAccount() {
        this.props.asyncActionBuilder('USE_MY_GOOGLE_ACCOUNT',
            Http.get$('/user/google/access-request-url?destinationUrl=https://' + window.location.hostname))
            .onComplete(([e]) => {
                console.log('e:', e)
                window.location = e.response.url
            })
            .dispatch()
    }

    render() {
        return (
            <div>
                <button onClick={this.createComposites.bind(this)}>Create composites</button>
                <br/><br/>
                <button onClick={this.classify.bind(this)}>Classify</button>
                <br/><br/>
                <button onClick={this.assessAccuracy.bind(this)}>Assess accuracy</button>
                <br/><br/><br/>
                <button onClick={this.useMyAccount.bind(this)}>Use my Google account</button>
            </div>
        )
    }
}

export default connect()(LandCover)
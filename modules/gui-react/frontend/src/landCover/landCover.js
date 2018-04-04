import React from 'react'
import {connect} from 'store'
import Http from 'http-client'

class LandCover extends React.Component {
    componentWillMount() {
        // Find out which step
        //      Start with a recipe step, then validate that expected assets and fusion tables are available

        // Get the task id, and use it to monitor state
        this.props.asyncActionBuilder('CREATE_COMPOSITES',
            Http.postJson$('/api/tasks', {
                operation: 'sepal.landcover.create_composites',
                params: {
                    fromYear: 2015,
                    toYear: 2017,
                    fusionTable: '15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F',
                    keyColumn: 'ISO',
                    keyValue : 'MMR',
                    sensors: ['L8', 'L7']
                }
            })
        ).dispatch()
    }

    render() {
        return (
            <div>Foo</div>
        )
    }
}

export default connect()(LandCover)
import {Button} from 'widget/button'
import {Layout} from 'widget/layout'
import {Widget} from 'widget/widget'
import {compose} from 'compose'
import {connect} from 'store'
import {getLogger} from 'log'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './mapInfo.module.css'

const log = getLogger('mapInfo')

const Info = () =>
    <Layout>
        <Widget label='one'>
            Some info here
        </Widget>
    </Layout>

class _MapInfo extends React.Component {
    render() {
        // const {area} = this.props
        return (
            <div className={styles.container}>
                <div className={styles.content}>
                    <Button
                        // chromeless
                        look='transparent'
                        shape='circle'
                        icon='info'
                        // label='This recipe - RED, GREEN, BLUE'
                        // label='users/foo/my-asset - NIR, SWIR1, RED'
                        // label='some_other_recipe_name - RED, GREEN, BLUE'
                        // label='Planet - 2020-03-05, 6 months'
                        // label='Google Satellite'
                        // icon='cog'
                        // label='Layer'
                        tooltip={<Info/>}
                        tooltipPlacement='right'
                        // onClick={() => log.debug('options', area)}
                    />
                </div>
            </div>
        )
    }
}

export const MapInfo = compose(
    _MapInfo,
    connect(),
)

MapInfo.propTypes = {
    area: PropTypes.string
}

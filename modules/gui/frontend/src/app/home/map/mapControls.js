import {Button} from 'widget/button'
import {Layout} from 'widget/layout'
import {Widget} from 'widget/widget'
import {compose} from 'compose'
import {connect} from 'store'
import {getLogger} from 'log'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './mapControls.module.css'

const log = getLogger('mapControls')

const Info = () =>
    <Layout>
        <Widget label='one'>
            Some info here
        </Widget>
        <Widget label='two'>
            Some other info here
        </Widget>
        <Widget label='three'>
            Last piece of info here
        </Widget>
    </Layout>

class _MapControls extends React.Component {
    render() {
        const {area} = this.props
        return (
            <div className={styles.container}>
                <div className={styles.controls}>
                    <Button
                        look='transparent'
                        shape='pill'
                        icon='cog'
                        label='Layer'
                        tooltip={<Info/>}
                        tooltipDelay={0}
                        onClick={() => log.debug('options', area)}
                    />
                </div>
            </div>
        )
    }
}

export const MapControls = compose(
    _MapControls,
    connect(),
)

MapControls.propTypes = {
    area: PropTypes.string
}

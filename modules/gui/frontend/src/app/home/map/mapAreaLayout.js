import {MapControls} from './mapControls'
import {compose} from 'compose'
import {withMapAreaContext} from './mapAreaContext'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './mapAreaLayout.module.css'

class _MapAreaLayout extends React.Component {
    render() {
        const {mapAreaContext: {area, refCallback}} = this.props
        return (
            <React.Fragment>
                <div
                    className={[styles.split, styles[area]].join(' ')}
                    ref={refCallback}
                />

                <div className={styles.view}>
                    <MapControls area={area}/>
                </div>
            </React.Fragment>
        )
    }
}

export const MapAreaLayout = compose(
    _MapAreaLayout,
    withMapAreaContext()
)

MapAreaLayout.propTypes = {
    layer: PropTypes.object,
    configForm: PropTypes.object
}

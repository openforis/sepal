import {MapControls} from './mapControls'
import {SplitOverlay} from 'widget/splitContent'
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
                <SplitOverlay area={area}>
                    <MapControls area={area}/>
                </SplitOverlay>
            </React.Fragment>
        )
    }
}

export const MapAreaLayout = compose(
    _MapAreaLayout,
    withMapAreaContext()
)

MapAreaLayout.propTypes = {
    form: PropTypes.object,
    layer: PropTypes.object
}

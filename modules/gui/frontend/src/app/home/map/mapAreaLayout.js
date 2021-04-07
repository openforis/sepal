import {compose} from 'compose'
import {connect} from 'store'
import {withMapAreaContext} from './mapAreaContext'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './mapAreaLayout.module.css'

class _MapAreaLayout extends React.Component {
    render() {
        const {mapAreaContext: {area, refCallback}} = this.props
        return (
            <div
                className={[styles.split, styles[area]].join(' ')}
                ref={refCallback}
            />
        )
    }

    // componentDidUpdate() {
    //     const {stream, source, layerConfig, map} = this.props
    //     console.log({layer})
    //     if (map && layer && !stream('CREATE_LAYER').active) {
    //         stream('CREATE_LAYER',
    //             createLayer$(layer, map),
    //             result => result
    //         )
    //     }
    // }
}

export const MapAreaLayout = compose(
    _MapAreaLayout,
    withMapAreaContext()
    // connect(),
)

MapAreaLayout.propTypes = {
    // area: PropTypes.string.isRequired,
    // map: PropTypes.object,
    // refCallback: PropTypes.func.isRequired
}

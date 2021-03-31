import {compose} from 'compose'
import {connect} from 'store'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './mapArea.module.css'

class _MapArea extends React.Component {
    render() {
        const {area, refCallback} = this.props
        return (
            <div
                className={[styles.split, styles[area]].join(' ')}
                ref={refCallback}
            />
        )
    }
}

export const MapArea = compose(
    _MapArea,
    connect(),
)

MapArea.propTypes = {
    area: PropTypes.string.isRequired,
    refCallback: PropTypes.func.isRequired
}

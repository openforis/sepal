import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import styles from './gauge.module.css'
import {Layout} from './layout'

export class Gauge extends React.Component {
    render() {
        const {className, infoTop, infoBottom, infoLeft, infoRight} = this.props
        return (
            <Layout
                type='vertical'
                spacing='tight'
                className={[styles.container, className].join(' ')}>
                {this.renderInfo(infoTop)}
                <Layout
                    type='horizontal-nowrap'
                    spacing='compact'>
                    {this.renderInfo(infoLeft)}
                    {this.renderBar()}
                    {this.renderInfo(infoRight)}
                </Layout>
                {this.renderInfo(infoBottom)}
            </Layout>
        )
    }

    renderBar() {
        return (
            <div
                className={styles.bar}
                style={{'--fraction': this.getFraction()}}
            />
        )
    }

    renderInfo(info) {
        return info
            ? (
                <div className={styles.info}>
                    {this.getInfo(info)}
                </div>
            )
            : null
    }

    getFraction() {
        const {value, minValue, maxValue} = this.props
        return (value - minValue) / (maxValue - minValue)
    }

    getInfo(info) {
        const {value, minValue, maxValue} = this.props
        const fraction = this.getFraction()
        const percentage = Math.round(this.getFraction() * 100)
        return _.isFunction(info)
            ? info({value, minValue, maxValue, fraction, percentage})
            : info
    }
}

Gauge.defaultProps = {
    minValue: 0
}

Gauge.propTypes = {
    maxValue: PropTypes.number.isRequired,
    value: PropTypes.number.isRequired,
    className: PropTypes.string,
    infoBottom: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
    infoLeft: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
    infoRight: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
    infoTop: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
    minValue: PropTypes.number
}

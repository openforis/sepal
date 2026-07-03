import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import format from '~/format'
import {msg} from '~/translate'
import {Graph} from '~/widget/graph'
import {isMobile} from '~/widget/userAgent'
import {Widget} from '~/widget/widget'

import styles from './landTrendrGraph.module.css'

export class LandTrendrGraph extends React.Component {
    state = {}

    render() {
        const {years} = this.props
        if (!years || !years.length) {
            return null
        }
        const unhighlightCallback = () => this.setState({point: null})
        return (
            <div className={styles.wrapper}>
                <Graph
                    data={this.calculateData()}
                    connectSeparatedPoints
                    labels={['dates', 'observations', 'segments']}
                    series={{
                        segments: {
                            strokeWidth: 2
                        },
                        observations: {
                            drawPoints: true,
                            strokeWidth: 0,
                            color: '#FFFFFF',
                            highlightCircleSize: 1
                        }
                    }}
                    highlightSeriesOpts={{
                        highlightCircleSize: 3
                    }}
                    errorBars
                    sigma={1}
                    showRangeSelector={!isMobile()}
                    rangeSelectorPlotFillColor={'#1B1B1C'}
                    rangeSelectorPlotFillGradientColor={'#1B1B1C'}
                    rangeSelectorPlotStrokeColor={'#1B1B1C'}
                    rangeSelectorAlpha={0.2}
                    rangeSelectorBackgroundStrokeColor={'rgba(100%, 100%, 100%, .15)'}
                    rangeSelectorForegroundStrokeColor={'rgba(100%, 100%, 100%, .15)'}
                    highlightCallback={isMobile() ? undefined : (event, x, points, row) => this.highlightCallback(row)}
                    unhighlightCallback={isMobile() ? undefined : unhighlightCallback}
                />
                {this.renderPoint()}
            </div>
        )
    }

    calculateData() {
        const {years, raw, fitted, isVertex} = this.props
        return years.map((year, i) => [
            new Date(year, 6, 1),
            [raw[i], 0],
            isVertex[i] ? [fitted[i], 0] : null
        ])
    }

    highlightCallback(row) {
        const {years, raw, fitted, isVertex} = this.props
        this.setState({
            point: {
                year: years[row],
                raw: raw[row],
                fitted: isVertex[row] ? fitted[row] : null
            }
        })
    }

    renderPoint() {
        const {point} = this.state
        if (!point) {
            return null
        }
        return (
            <div className={styles.point}>
                <Widget
                    className={styles.year}
                    label={msg('process.landTrendr.mapToolbar.graph.year.label')}>
                    {point.year}
                </Widget>
                <Widget
                    className={styles.observation}
                    label={msg('process.landTrendr.mapToolbar.graph.observation.label')}>
                    {format.number({value: point.raw, precisionDigits: 3})}
                </Widget>
                {_.isFinite(point.fitted)
                    ? (
                        <Widget
                            className={styles.fitted}
                            label={msg('process.landTrendr.mapToolbar.graph.fitted.label')}>
                            {format.number({value: point.fitted, precisionDigits: 3})}
                        </Widget>
                    )
                    : null}
            </div>
        )
    }
}

LandTrendrGraph.propTypes = {
    fitted: PropTypes.array,
    isVertex: PropTypes.array,
    raw: PropTypes.array,
    years: PropTypes.array
}

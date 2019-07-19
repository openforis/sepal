import {HoverDetector} from 'widget/hover'
import {assignAreas, validAreas} from './layerAreas'
import {throwStatement} from '@babel/types'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './layerDrop.module.css'

export default class LayerDrop extends React.Component {
    state = {
        areaCenters: null,
        nextAreas: undefined,
        closestArea: undefined,
        hovering: false
    }
    areaRefs = {
        center: React.createRef(),
        top: React.createRef(),
        topRight: React.createRef(),
        right: React.createRef(),
        bottomRight: React.createRef(),
        bottom: React.createRef(),
        bottomLeft: React.createRef(),
        left: React.createRef(),
        topLeft: React.createRef(),
    }

    setHovering(hovering) {
        const {areas, onHover} = this.props
        this.setState({hovering})
        if (onHover && !hovering) {
            onHover(areas)
        }
    }

    render() {
        const {areas, dragging, className} = this.props
        const {hovering} = this.state
        const includeCorners = Object.keys(areas).length > 1
        return (
            <HoverDetector onHover={hovering => this.setHovering(hovering)} className={[
                styles.container,
                dragging ? styles.dragging : null,
                hovering ? styles.hovering : null,
                className
            ].join(' ')}>
                {this.renderCenter()}
                {this.renderTopBottom()}
                {this.renderLeftRight()}
                {includeCorners ? this.renderCorners() : null}
            </HoverDetector>
        )
    }

    renderCenter() {
        return (
            <div className={styles.layoutWrapper}>
                <div className={[styles.layout, styles.center].join(' ')}>
                    {this.renderArea('center')}
                </div>
            </div>
        )
    }

    renderTopBottom() {
        return (
            <div className={styles.layoutWrapper}>
                <div className={[styles.layout, styles.topBottom].join(' ')}>
                    {this.renderArea('top')}
                    {this.renderArea('bottom')}
                </div>
            </div>
        )
    }

    renderLeftRight() {
        return (
            <div className={styles.layoutWrapper}>
                <div className={[styles.layout, styles.leftRight].join(' ')}>
                    {this.renderArea('left')}
                    {this.renderArea('right')}
                </div>
            </div>
        )
    }

    renderCorners() {
        return (
            <div className={styles.layoutWrapper}>
                <div className={[styles.layout, styles.corners].join(' ')}>
                    {this.renderArea('topLeft')}
                    {this.renderArea('topRight')}
                    {this.renderArea('bottomLeft')}
                    {this.renderArea('bottomRight')}
                </div>
            </div>
        )
    }

    renderArea(area) {
        const {areas, dragging, children} = this.props
        const {closestArea} = this.state
        const highlighted = dragging && (closestArea === area)
        const value = areas[area]
        return (
            <div
                ref={this.areaRefs[area]}
                key={area}
                className={[
                    styles.area,
                    highlighted ? styles.highlighted : null,
                    value ? styles.assigned : null
                ].join(' ')}>
                <div className={styles.placeholder}>
                    {value && children({area, value})}
                </div>
            </div>
        )
    }

    componentDidUpdate(prevProps, prevState) {
        const {areas, cursor, value, onUpdate} = this.props
        const {hovering, areaCenters} = this.state
        if (areas && !areaCenters) {
            this.setState({areaCenters: this.calculateDropTargetCenters()})
        }
        if (hovering) {
            if (areaCenters && !_.isEqual(prevProps.cursor, cursor)) {
                const closestArea = this.calculateClosestArea(areaCenters, cursor)
                if (closestArea !== prevState.closestArea) {
                    const nextAreas = assignAreas({areas, area: closestArea, value})
                    this.setState({nextAreas, areaCenters: this.calculateDropTargetCenters()})
                    onUpdate && onUpdate(nextAreas)
                }
                this.setState({closestArea})
            }
        }
    }

    calculateClosestArea(areaCenters, cursor) {
        return _.chain(areaCenters)
            .mapValues(center => Math.pow(center.x - cursor.x, 2) + Math.pow(center.y - cursor.y, 2))
            .toPairs()
            .minBy(1)
            .get(0)
            .value()
    }

    calculateDropTargetCenters() {
        const {areas} = this.props
        const centers = {}
        validAreas(areas).forEach(area => {
            const areaElement = this.areaRefs[area].current
            const {top, right, bottom, left} = areaElement.getBoundingClientRect()
            const center = {y: Math.round((top + bottom) / 2), x: Math.round((left + right) / 2)}
            centers[area] = center
        }
        )
        return centers
    }
}

LayerDrop.propTypes = {
    areas: PropTypes.shape({
        area: PropTypes.oneOf(['center', 'top', 'topRight', 'right', 'bottomRight', 'bottom', 'bottomLeft', 'left', 'topLeft']),
        value: PropTypes.any
    }),
    className: PropTypes.string,
    cursor: PropTypes.shape({
        x: PropTypes.number,
        y: PropTypes.number,
    }),
    value: PropTypes.any,
    onUpdate: PropTypes.func
}

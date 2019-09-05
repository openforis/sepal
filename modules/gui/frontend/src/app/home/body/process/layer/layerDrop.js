import {HoverDetector} from 'widget/hover'
import {assignArea, validAreas} from './layerAreas'
import {compose} from 'compose'
import {distinctUntilChanged, filter, map, mapTo} from 'rxjs/operators'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './layerDrop.module.css'
import withSubscription from 'subscription'

class _LayerDrop extends React.Component {
    state = {
        areaCenters: null,
        nextAreas: undefined,
        closestArea: undefined,
        hovering: false,
        dragging: false,
        dragValue: null
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
        this.setState({hovering})
    }

    render() {
        const {areas, className} = this.props
        const {dragging, hovering} = this.state
        const includeCorners = Object.keys(areas).length > 1
        return (
            <HoverDetector
                className={[
                    styles.container,
                    dragging ? styles.dragging : null,
                    hovering ? styles.hovering : null,
                    className
                ].join(' ')}
                onHover={hovering => this.setHovering(hovering)}>
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
        const {areas, children} = this.props
        const {dragging, closestArea} = this.state
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

    componentDidMount() {
        const {drag$} = this.props
        
        const dragStart$ = drag$.pipe(
            filter(({dragging}) => dragging === true),
            map(({value}) => value)
        )
        const dragMove$ = drag$.pipe(
            filter(({coords}) => coords),
            map(({coords}) => coords),
            map(coords => this.calculateClosestArea(coords)),
            distinctUntilChanged()
        )
        const dragEnd$ = drag$.pipe(
            filter(({dragging}) => dragging === false),
            mapTo()
        )
        
        withSubscription(
            dragStart$.subscribe(
                value => this.onDragStart(value)
            ),
            dragMove$.subscribe(
                closestArea => this.onDragMove(closestArea)
            ),
            dragEnd$.subscribe(
                () => this.onDragEnd()
            )
        )
    }

    onDragStart(value) {
        this.setState({
            dragging: true,
            dragValue: value
        })
    }

    onDragMove(closestArea) {
        const {areas} = this.props
        const {dragValue} = this.state
        if (closestArea) {
            this.setState({
                closestArea,
                nextAreas: assignArea({areas, area: closestArea, value: dragValue}),
                areaCenters: this.calculateDropTargetCenters()
            })
        }
    }

    onDragEnd() {
        const {onUpdate} = this.props
        const {hovering, nextAreas} = this.state
        this.setState({
            dragging: false,
            dragValue: null
        })
        if (hovering) {
            onUpdate && onUpdate(nextAreas)
        }
    }

    componentDidUpdate() {
        const {areas} = this.props
        const {areaCenters} = this.state
        if (areas && !areaCenters) {
            this.setState({areaCenters: this.calculateDropTargetCenters()})
        }
    }

    calculateClosestArea(cursor) {
        const {areaCenters, dragging} = this.state
        const squaredDistanceFromCursor = center => Math.pow(center.x - cursor.x, 2) + Math.pow(center.y - cursor.y, 2)
        return dragging
            ? _.chain(areaCenters)
                .mapValues(areaCenter => squaredDistanceFromCursor(areaCenter))
                .toPairs()
                .minBy(1)
                .get(0)
                .value()
            : null
    }

    calculateDropTargetCenters() {
        const {areas} = this.props
        const centers = {}
        validAreas(areas).forEach(area => {
            const areaElement = this.areaRefs[area].current
            const {top, right, bottom, left} = areaElement.getBoundingClientRect()
            const center = {y: Math.round((top + bottom) / 2), x: Math.round((left + right) / 2)}
            centers[area] = center
        })
        return centers
    }
}

export const LayerDrop = compose(
    _LayerDrop,
    withSubscription()
)

LayerDrop.propTypes = {
    areas: PropTypes.shape({
        area: PropTypes.oneOf(['center', 'top', 'topRight', 'right', 'bottomRight', 'bottom', 'bottomLeft', 'left', 'topLeft']),
        value: PropTypes.any
    }),
    className: PropTypes.string,
    drag$: PropTypes.object,
    onUpdate: PropTypes.func
}

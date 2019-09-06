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

    render() {
        const {className} = this.props
        const {dragging, hovering} = this.state
        return (
            <HoverDetector
                className={[
                    styles.container,
                    dragging ? styles.dragging : null,
                    hovering ? styles.hovering : null,
                    className
                ].join(' ')}
                onHover={hovering => this.setState({hovering})}>
                {this.renderCurrentAreas()}
                {this.renderNextAreas()}
            </HoverDetector>
        )
    }

    renderCurrentAreas() {
        const {areas} = this.props
        const {nextAreas, dragging, hovering} = this.state
        const hidden = !!(dragging && hovering && nextAreas)
        return (
            <div className={hidden ? styles.hidden : null}>
                {this.renderAreas(areas, true)}
            </div>
        )
    }

    renderNextAreas() {
        const {nextAreas, dragging, hovering} = this.state
        return dragging && hovering && nextAreas
            ? this.renderAreas(nextAreas, false)
            : null
    }

    renderAreas(areas, current) {
        return (
            <React.Fragment>
                <div className={styles.layoutWrapper}>
                    <div className={[styles.layout, styles.center].join(' ')}>
                        {this.renderArea(areas, current, 'center')}
                    </div>
                </div>
                <div className={styles.layoutWrapper}>
                    <div className={[styles.layout, styles.topBottom].join(' ')}>
                        {this.renderArea(areas, current, 'top')}
                        {this.renderArea(areas, current, 'bottom')}
                    </div>
                </div>
                <div className={styles.layoutWrapper}>
                    <div className={[styles.layout, styles.leftRight].join(' ')}>
                        {this.renderArea(areas, current, 'left')}
                        {this.renderArea(areas, current, 'right')}
                    </div>
                </div>
                <div className={styles.layoutWrapper}>
                    <div className={[styles.layout, styles.corners].join(' ')}>
                        {this.renderArea(areas, current, 'topLeft')}
                        {this.renderArea(areas, current, 'topRight')}
                        {this.renderArea(areas, current, 'bottomLeft')}
                        {this.renderArea(areas, current, 'bottomRight')}
                    </div>
                </div>
            </React.Fragment>
        )
    }

    renderArea(areas, current, area) {
        const {dragging, closestArea} = this.state
        const highlighted = !current && dragging && area === closestArea
        const value = areas[area]
        return (
            <div
                ref={current ? this.areaRefs[area] : null}
                key={area}
                className={[
                    styles.area,
                    highlighted ? styles.highlighted : null,
                    value ? styles.assigned : null
                ].join(' ')}>
                {this.renderAreaContent(area, value)}
            </div>
        )
    }

    renderAreaContent(area, value) {
        const {children} = this.props
        return value
            ? (
                <div className={styles.areaContent}>
                    {children({area, value})}
                </div>
            )
            : null
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

    componentDidUpdate(prevProps) {
        const {areas} = this.props
        if (prevProps.areas !== areas) {
            this.setState({areaCenters: this.calculateDropTargetCenters()})
        }
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
                nextAreas: assignArea({areas, area: closestArea, value: dragValue})
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

    calculateClosestArea(cursor) {
        const {areaCenters, dragging} = this.state
        const squaredDistanceFromCursor = center =>
            Math.pow(center.x - cursor.x, 2) + Math.pow(center.y - cursor.y, 2)
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
        validAreas(areas)
            .forEach(area => {
                const areaElement = this.areaRefs[area].current
                const {top, right, bottom, left} = areaElement.getBoundingClientRect()
                centers[area] = {
                    x: Math.round((left + right) / 2),
                    y: Math.round((top + bottom) / 2)
                }
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

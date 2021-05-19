import {HoverDetector} from 'widget/hover'
import {Padding} from 'widget/padding'
import {Subject, merge} from 'rxjs'
import {SuperButton} from 'widget/superButton'
import {assignArea, removeArea, validAreas} from './layerAreas'
import {compose} from 'compose'
import {distinctUntilChanged, filter, map, mapTo} from 'rxjs/operators'
import {getImageLayerSource} from 'app/home/map/imageLayerSource/imageLayerSource'
import {msg} from 'translate'
import {withLayers} from '../withLayers'
import {withRecipe} from 'app/home/body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './areas.module.css'
import withSubscription from 'subscription'

class _Areas extends React.Component {
    state = {
        areaCenters: null,
        currentAreas: undefined,
        nextAreas: undefined,
        closestArea: undefined,
        hovering: false,
        dragging: false,
        dragMode: undefined,
        dragValue: null
    }

    areaRefs = {
        'center': React.createRef(),
        'top': React.createRef(),
        'top-right': React.createRef(),
        'right': React.createRef(),
        'bottom-right': React.createRef(),
        'bottom': React.createRef(),
        'bottom-left': React.createRef(),
        'left': React.createRef(),
        'top-left': React.createRef(),
    }

    areaDrag$ = new Subject()

    render() {
        const {dragging, dragMode, hovering} = this.state
        return (
            <Padding noHorizontal>
                <HoverDetector
                    className={_.flatten([
                        styles.container,
                        dragging ? [styles.dragging, styles[dragMode]] : null,
                        hovering ? styles.hovering : null
                    ]).join(' ')}
                    onHover={hovering => this.setState({hovering})}>
                    {this.renderCurrentAreas()}
                    {this.renderNextAreas()}
                </HoverDetector>
            </Padding>
        )
    }

    renderCurrentAreas() {
        const {layers: {areas}} = this.props
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
                        {this.renderArea(areas, current, 'top-left')}
                        {this.renderArea(areas, current, 'top-right')}
                        {this.renderArea(areas, current, 'bottom-left')}
                        {this.renderArea(areas, current, 'bottom-right')}
                    </div>
                </div>
            </React.Fragment>
        )
    }

    renderArea(areas, current, area) {
        const {dragging, closestArea} = this.state
        const highlighted = !current && dragging && area === closestArea
        const sourceId = areas[area]
            ? areas[area].imageLayer.sourceId
            : null
        return (
            <div
                ref={current ? this.areaRefs[area] : null}
                key={area}
                className={[
                    styles.area,
                    highlighted ? styles.highlighted : null,
                    sourceId ? styles.assigned : null
                ].join(' ')}>
                {this.renderSourceInfo(area, sourceId)}
            </div>
        )
    }

    renderSourceInfo(area, sourceId) {
        const {recipe, imageLayerSources} = this.props
        const source = imageLayerSources.find(source => source.id === sourceId)
        const {description} = getImageLayerSource({recipe, source})
        return source
            ? (
                <div className={styles.areaContent}>
                    <SuperButton
                        title={msg(`imageLayerSources.${source.type}.label`)}
                        description={description}
                        removeMessage={msg('map.layout.area.remove.message')}
                        removeTooltip={msg('map.layout.area.remove.tooltip')}
                        unsafeRemove
                        drag$={this.areaDrag$}
                        dragValue={area}
                        onRemove={() => this.removeArea(area)}
                    />
                </div>
            )
            : null
    }

    componentDidMount() {
        this.initializeDragDrop()
    }

    initializeDragDrop() {
        const {sourceDrag$} = this.props
        const {areaDrag$} = this

        const drag$ = merge(sourceDrag$, areaDrag$)

        const sourceDragStart$ = sourceDrag$.pipe(
            filter(({dragging}) => dragging === true),
            map(({value}) => value)
        )
        const areaDragStart$ = areaDrag$.pipe(
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
            sourceDragStart$.subscribe(
                value => this.onSourceDragStart(value)
            ),
            areaDragStart$.subscribe(
                area => this.onAreaDragStart(area)
            ),
            dragMove$.subscribe(
                closestArea => this.onDragMove(closestArea)
            ),
            dragEnd$.subscribe(
                () => this.onDragEnd()
            )
        )
    }

    onSourceDragStart(sourceId) {
        const {layers: {areas}} = this.props
        this.onDragStart({
            dragging: true,
            dragMode: 'adding',
            dragValue: sourceId,
            currentAreas: areas
        })
    }

    onAreaDragStart(area) {
        const {layers: {areas}} = this.props
        this.onDragStart({
            dragging: true,
            dragMode: 'moving',
            dragValue: areas[area],
            currentAreas: removeArea({areas, area})
        })
    }

    onDragStart({dragging, dragMode, dragValue, currentAreas}) {
        const areaCenters = this.calculateDropTargetCenters(currentAreas)
        this.setState({
            dragging,
            dragMode,
            dragValue,
            currentAreas,
            areaCenters
        })
    }

    onDragMove(closestArea) {
        const {currentAreas, dragValue} = this.state
        if (currentAreas && closestArea) {
            const nextAreas = assignArea({
                areas: currentAreas,
                area: closestArea,
                value: dragValue
            })
            this.setState({
                closestArea,
                nextAreas
            })
        }
    }

    onDragEnd() {
        const {hovering, nextAreas} = this.state
        this.setState({
            dragging: false,
            dragValue: null
        })
        if (hovering) {
            this.updateAreas(nextAreas)
        }
    }

    updateAreas(areas) {
        const {recipeActionBuilder} = this.props
        recipeActionBuilder('UPDATE_LAYER_AREAS')
            .set('layers.areas', areas)
            .dispatch()
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

    calculateDropTargetCenters(areas) {
        const centers = {}
        const valid = validAreas(areas)
        valid.forEach(area => {
            const areaElement = this.areaRefs[area].current
            const {top, right, bottom, left} = areaElement.getBoundingClientRect()
            centers[area] = {
                x: Math.round((left + right) / 2),
                y: Math.round((top + bottom) / 2)
            }
        })
        return centers
    }

    removeArea(area) {
        const {layers: {areas}, recipeActionBuilder} = this.props
        recipeActionBuilder('REMOVE_AREA')
            .set('layers.areas', removeArea({areas, area}))
            .dispatch()
    }
}

export const Areas = compose(
    _Areas,
    withLayers(),
    withRecipe(recipe => ({recipe})),
    withSubscription()
)

Areas.propTypes = {
    // areas: PropTypes.shape({
    //     area: PropTypes.oneOf(['center', 'top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left', 'top-left']),
    //     value: PropTypes.any
    // }),
    sourceDrag$: PropTypes.object
}

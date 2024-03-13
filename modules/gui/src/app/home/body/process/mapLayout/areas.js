import {CrudItem} from '~/widget/crudItem'
import {HoverDetector} from '~/widget/hover'
import {ListItem} from '~/widget/listItem'
import {Padding} from '~/widget/padding'
import {Subject, distinctUntilChanged, filter, map, switchMap, takeUntil} from 'rxjs'
import {assignArea, removeArea, swapAreas, validAreas} from './layerAreas'
import {compose} from '~/compose'
import {getImageLayerSource} from '../imageLayerSourceRegistry'
import {msg} from '~/translate'
import {withLayers} from '../withLayers'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {withSubscriptions} from '~/subscription'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './areas.module.css'

const AREA = Symbol('area')
const SOURCE = Symbol('source')

class _Areas extends React.Component {
    constructor(props) {
        super(props)
        this.onHover = this.onHover.bind(this)
    }

    state = {
        dragging: null,
        dropArea: null,
        currentAreas: null,
        nextAreas: null,
        hovering: false
    }

    areaCenters = null

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

    onHover(hovering) {
        this.setState({hovering})
    }

    render() {
        const {dragging, hovering} = this.state
        return (
            <Padding noHorizontal>
                <HoverDetector
                    className={_.flatten([
                        styles.container,
                        dragging ? [styles.dragging, styles[dragging.description]] : null,
                        hovering ? styles.hovering : null
                    ]).join(' ')}
                    onHover={this.onHover}>
                    {this.renderCurrentAreas()}
                    {this.renderNextAreas()}
                </HoverDetector>
            </Padding>
        )
    }

    renderCurrentAreas() {
        const {layers: {areas}} = this.props
        const {nextAreas, dragging, hovering, currentAreas} = this.state
        const hidden = !!(dragging && hovering && nextAreas)
        return (
            <React.Fragment>
                {currentAreas && !hidden && !hovering && dragging === AREA
                    ? this.renderAreas(currentAreas, false)
                    : null
                }
                <div className={hidden || (!hovering && dragging === AREA) ? styles.hidden : null}>
                    {this.renderAreas(areas, true)}
                </div>
            </React.Fragment>
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
        const {dragging, dropArea} = this.state
        const highlighted = !current && dragging && area === dropArea
        const sourceId = areas[area] && areas[area].imageLayer
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
                    <ListItem
                        drag$={this.areaDrag$}
                        dragValue={area}>
                        <CrudItem
                            title={msg(`imageLayerSources.${source.type}.label`)}
                            description={description}
                        />
                    </ListItem>
                </div>
            )
            : null
    }

    componentDidMount() {
        this.initializeDragDrop()
    }

    drag$(drag$, release$) {
        return drag$.pipe(
            filter(({dragging}) => dragging === true),
            switchMap(({value}) =>
                drag$.pipe(
                    takeUntil(release$),
                    map(({coords}) => ({value, dropArea: this.getDropArea(coords)})),
                    distinctUntilChanged()
                )
            )
        )
    }

    release$(drag$) {
        return drag$.pipe(
            filter(({dragging}) => dragging === false)
        )
    }

    initializeDragDrop() {
        const {sourceDrag$, addSubscription} = this.props
        const {areaDrag$} = this

        const sourceRelease$ = this.release$(sourceDrag$)

        const sourceDragMove$ = this.drag$(sourceDrag$, sourceRelease$).pipe(
            map(({value: source, dropArea}) => ({source, dropArea}))
        )

        const areaRelease$ = this.release$(areaDrag$)

        const areaDragMove$ = this.drag$(areaDrag$, areaRelease$).pipe(
            map(({value: area, dropArea}) => ({area, dropArea}))
        )

        addSubscription(
            sourceDragMove$.subscribe(
                ({source, dropArea}) => this.onSourceDrag({source, dropArea})
            ),
            sourceRelease$.subscribe(
                () => this.onSourceRelease()
            ),
            areaDragMove$.subscribe(
                ({area, dropArea}) => this.onAreaDrag({area, dropArea})
            ),
            areaRelease$.subscribe(
                () => this.onAreaRelease()
            )
        )
    }

    onDrag({dragging, currentAreas, nextAreas, dropArea}) {
        this.areaCenters = this.calculateDropTargetCenters(currentAreas)
        this.setState({
            dragging,
            dropArea,
            currentAreas,
            nextAreas
        })
    }

    onRelease() {
        this.areaCenters = null
        this.setState({
            dragging: null,
            dropArea: null,
            currentAreas: null,
            nextAreas: null
        })
    }

    onSourceDrag({source, dropArea}) {
        const {layers: {areas}} = this.props
        const currentAreas = areas
        const nextAreas = dropArea
            ? assignArea({
                areas: currentAreas,
                area: dropArea,
                value: source
            })
            : null
        this.onDrag({dragging: SOURCE, dropArea, currentAreas, nextAreas})
    }

    onSourceRelease() {
        const {hovering, nextAreas} = this.state
        if (hovering) {
            nextAreas && this.updateAreas(nextAreas)
        }
        this.onRelease()
    }

    onAreaDrag({area, dropArea}) {
        const {layers: {areas}} = this.props
        const currentAreas = removeArea({areas, area})
        const swap = Object.keys(areas).includes(dropArea)
        const nextAreas = dropArea
            ? swap
                ? swapAreas({
                    areas,
                    from: area,
                    to: dropArea
                })
                : assignArea({
                    areas: currentAreas,
                    area: dropArea,
                    value: areas[area]
                })
            : null
        this.onDrag({dragging: AREA, dropArea, currentAreas, nextAreas})
    }

    onAreaRelease() {
        const {hovering, currentAreas, nextAreas} = this.state
        if (hovering) {
            nextAreas && this.updateAreas(nextAreas)
        } else {
            // remove area
            this.updateAreas(currentAreas)
        }
        this.onRelease()
    }

    updateAreas(areas) {
        const {recipeActionBuilder} = this.props
        recipeActionBuilder('UPDATE_LAYER_AREAS')
            .set('layers.areas', areas)
            .dispatch()
    }

    getDropArea(cursor) {
        const {dragging, hovering} = this.state
        const {areaCenters} = this
        const squaredDistanceFromCursor = center =>
            Math.pow(center.x - cursor.x, 2) + Math.pow(center.y - cursor.y, 2)
        return dragging && hovering
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
    withSubscriptions()
)

Areas.propTypes = {
    sourceDrag$: PropTypes.object
}

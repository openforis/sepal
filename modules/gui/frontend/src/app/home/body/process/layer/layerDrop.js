import {withRecipe} from 'app/home/body/process/recipeContext'
import {compose} from 'compose'
import _ from 'lodash'
import React from 'react'
import Portal from 'widget/portal'
import {assignAreas} from './layerAreas'
import styles from './layerDrop.module.css'

const mapRecipeToProps = recipe => ({
    layers: recipe.layers
})

class LayerDrop extends React.Component {
    state = {
        areaCenters: null,
        nextAreas: {},
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
        const {layers: {areas}} = this.props
        const includeCorners = Object.keys(areas).length > 1
        return (
            <Portal type='section'>
                <div className={styles.container}>
                    {this.renderCenter()}
                    {this.renderTopBottom()}
                    {this.renderLeftRight()}
                    {includeCorners ? this.renderCorners() : null}
                </div>
            </Portal>
        )
    }

    renderCenter() {
        return (
            <div className={[styles.layout, styles.center].join(' ')}>
                {this.renderArea('center')}
            </div>
        )
    }

    renderTopBottom() {
        return (
            <div className={[styles.layout, styles.topBottom].join(' ')}>
                {this.renderArea('top')}
                {this.renderArea('bottom')}
            </div>
        )
    }

    renderLeftRight() {
        return (
            <div className={[styles.layout, styles.leftRight].join(' ')}>
                {this.renderArea('left')}
                {this.renderArea('right')}
            </div>
        )
    }

    renderCorners() {
        return (
            <div className={[styles.layout, styles.corners].join(' ')}>
                {this.renderArea('topLeft')}
                {this.renderArea('topRight')}
                {this.renderArea('bottomLeft')}
                {this.renderArea('bottomRight')}
            </div>
        )
    }

    renderArea(area) {
        const {layers: {images}} = this.props
        const {closestArea, nextAreas} = this.state
        const layerId = nextAreas[area]
        const layer = images.find(({id}) => id === layerId)
        return <div
            ref={this.areaRefs[area]}
            key={area}
            className={[
                styles.area,
                closestArea === area ? styles.selected : null,
                layerId ? styles.layer : null
            ].join(' ')}>
            {layer && layer.title}
        </div>
    }

    componentDidUpdate(prevProps, prevState) {
        const {cursor, layer: {id}, layers: {areas}} = this.props
        const {areaCenters} = this.state
        if (areas && !areaCenters) {
            this.setState({areaCenters: this.calculateDropTargetCenters()})
        }
        if (areaCenters && !_.isEqual(prevProps.cursor, cursor)) {
            const closestArea = this.calculateClosestArea(areaCenters, cursor)
            if (closestArea !== prevState.closestArea) {
                const nextAreas = assignAreas({areas, area: closestArea, id})
                this.setState({nextAreas})
            }
            this.setState({closestArea})
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
        const centers = {}
        Object.keys(this.areaRefs).forEach(area => {
                const areaElement = this.areaRefs[area].current
                const {top, right, bottom, left} = areaElement.getBoundingClientRect()
                const center = {y: Math.round((top + bottom) / 2), x: Math.round((left + right) / 2)}
                centers[area] = center
            }
        )
        return centers
    }
}

export default compose(
    LayerDrop,
    withRecipe(mapRecipeToProps)
)

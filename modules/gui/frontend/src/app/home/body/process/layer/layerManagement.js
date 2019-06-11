import LayerDrop from 'app/home/body/process/layer/layerDrop'
import {withRecipe} from 'app/home/body/process/recipeContext'
import {compose} from 'compose'
import guid from 'guid'
import React from 'react'
import {Button} from 'widget/button'
import {Buttons} from 'widget/buttons'
import Draggable from 'widget/draggable'
import Icon from 'widget/icon'
import Label from 'widget/label'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import SuperButton from 'widget/superButton'
import {recipeActionBuilder} from '../recipe'
import styles from './layerManagement.module.css'

const mapRecipeToProps = recipe => {
    return {
        recipeId: recipe.id,
        ...(recipe.layers || {images: []})
    }
}

class LayerManagement extends React.Component {
    state = {
        hovering: false,
        draggedImage: null,
        areas: null
    }

    render() {
        const {hovering, draggedImage} = this.state
        return <React.Fragment>
            {hovering || draggedImage
                ? this.renderOpenedPanel()
                : this.renderCollapsedPanel()}
            {this.renderLayerDrop()}
        </React.Fragment>
    }

    renderLayerDrop() {
        const {draggedImage, hoveredImage, hovering} = this.state
        return <LayerDrop
            layer={draggedImage}
            highlight={hoveredImage}
            disabled={hovering}
            hide={!hovering && !draggedImage}
            cursor={this.state.cursor}
            onUpdate={areas => {
                this.setState({areas})
            }}
        />
    }

    renderCollapsedPanel() {
        const {images} = this.props
        return (
            <Panel
                id='layers'
                className={styles.panel}
                type='bottom-center'>
                <div onMouseOver={() => this.setState({hovering: true})}>
                    <PanelHeader
                        icon='layer-group'
                        title={`${images.length} layers`}/>
                </div>
            </Panel>
        )
    }

    renderOpenedPanel() {
        const {images} = this.props
        const {draggedImage, hovering} = this.state
        return (
            <React.Fragment>
                <div
                    onMouseOver={() => this.setState({hovering: true})}
                    onMouseLeave={() => this.setState({hovering: false})}>
                    <Panel
                        id='layers'
                        className={[
                            styles.panel,
                            hovering ? styles.hovering : null,
                            draggedImage ? styles.dragging : null
                        ].join(' ')}
                        type='bottom-center'>
                        <PanelHeader
                            icon='layer-group'
                            title={`${images.length} layers`}
                            label={this.renderLayoutButtons()}/>
                        <PanelContent>
                            {this.renderImages()}
                            <Label>
                                Features
                            </Label>
                        </PanelContent>
                    </Panel>
                </div>
            </React.Fragment>

        )
    }

    renderLayoutButtons() {
        const {layout} = this.props
        const options = [
            {value: 'single', label: <Icon name='square-full'/>},
            {value: 'grid', label: <Icon name='th-large'/>}
        ]
        return (
            <Buttons
                selected={layout}
                size='small'
                onChange={layout => this.setLayout(layout)}
                options={options}
                className={styles.layoutButtons}/>
        )
    }

    renderImages() {
        const {images} = this.props
        return (
            <div>
                <div className={styles.layersListHeader}>
                    <Label msg='Images'/>
                    <Button
                        shape='circle'
                        look='add'
                        size='small'
                        icon='plus'
                        onClick={() => this.addImage()}
                    />
                </div>
                {images.map(image =>
                    <div
                        key={image.id}
                        onMouseOver={() => this.setState({hoveredImage: image})}
                        onMouseLeave={() => this.setState({hoveredImage: null})}>
                        <Draggable
                            key={image.id}
                            onStart={() => this.setDragging(image)}
                            onDrag={cursor => this.setState({cursor})}
                            onEnd={() => this.onDragEnd()}>
                            <Layer layer={image}/>
                        </Draggable>
                    </div>
                )}
            </div>
        )
    }

    onDragEnd() {
        const {areas, hovering} = this.state
        this.setDragging()
        if (!hovering) // Hovering is canceling
            this.setAreas(areas)
    }

    setDragging(image) {
        this.setState({draggedImage: image})
    }

    setAreas(areas) {
        this.actionBuilder('SET_AREAS', areas)
            .set('layers.areas', areas)
            .dispatch()
    }

    setLayout(layout) {
        this.actionBuilder('SET_LAYOUT', {layout})
            .set('layers.layout', layout)
            .dispatch()
    }

    addImage() {
        console.log('addImage')
    }

    actionBuilder(type, props) {
        const {recipeId} = this.props
        return recipeActionBuilder(recipeId)(type, props)
    }

    componentDidMount() {
        // TODO: Dummy setup
        const thisRecipe = {id: guid(), type: 'GEE', title: 'This recipe', bands: ['RED', 'GREEN', 'BLUE']}
        const anotherRecipe = {
            id: guid(), type: 'GEE', title: 'Another Mosaic with a bit longer name', bands: ['NIR', 'SWIR1', 'RED']
        }
        const planet = {id: guid(), type: 'PLANET', title: 'Planet', description: 'Analytic mosaic'}
        const googleSatellite = {
            id: guid(),
            type: 'GOOGLE_SATELLITE',
            title: 'Google Satellite',
            description: 'Latest Google Satellite imagery'
        }
        this.actionBuilder('SETUP_DUMMY_LAYERS')
            .set('layers', {
                layout: 'single',
                images: [
                    thisRecipe,
                    anotherRecipe, planet, googleSatellite
                ],
                areas: {left: thisRecipe.id, right: anotherRecipe.id}

            })
            .dispatch()
    }
}

export default compose(
    LayerManagement,
    withRecipe(mapRecipeToProps)
)

class Layer extends React.Component {
    render() {
        const {layer: {id, title, description}} = this.props
        return (
            <SuperButton
                key={id}
                title={<div className={styles.layerTitle}>{title}</div>}
                description={description || this.renderBands()}
                onRemove={() => console.log('remove')}
                onEdit={() => console.log('edit')}
                onClick={() => console.log('click')}
                removeMessage={'Are you sure you want to remove this layer?'}
                className={styles.layer}/>
        )
    }

    renderBands() {
        const {layer: {bands}} = this.props
        return <div className={styles.rgbBands}>
            <div className={styles.red}>{bands[0]}</div>
            <div className={styles.green}>{bands[1]}</div>
            <div className={styles.blue}>{bands[2]}</div>
        </div>
    }
}

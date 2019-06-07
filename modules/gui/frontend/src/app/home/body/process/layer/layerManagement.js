import {withRecipe} from 'app/home/body/process/recipeContext'
import {compose} from 'compose'
import guid from 'guid'
import React from 'react'
import {Button} from 'widget/button'
import {Buttons} from 'widget/buttons'
import Icon from 'widget/icon'
import Label from 'widget/label'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import Sortable from 'widget/sortable'
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
        hover: false
    }

    render() {
        const {hover} = this.state
        return hover ? this.renderOpenedPanel() : this.renderCollapsedPanel()
        // return this.renderOpenedPanel()
    }

    renderCollapsedPanel() {
        const {images} = this.props
        return (
            <Panel
                id={'bandSelection'}
                className={styles.panel}
                type='bottom-center'>
                <div
                    onMouseEnter={() => this.setState({hover: true})}
                    onMouseLeave={() => this.setState({hover: false})}>
                    <PanelHeader
                        icon='layer-group'
                        title={`${images.length} layers`}/>
                </div>
            </Panel>
        )
    }

    renderOpenedPanel() {
        const {images} = this.props
        return (
            <div
                onMouseEnter={() => this.setState({hover: true})}
                onMouseLeave={() => this.setState({hover: false})}>
                <Panel
                    id={'bandSelection'}
                    className={styles.panel}
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
                <Sortable items={images}>
                    {image =>
                        <Layer
                            layer={image}
                            show={image.shown}
                            onToggleShow={() => this.toggleShown(image)}/>
                    }
                </Sortable>
            </div>
        )
    }

    setLayout(layout) {
        this.actionBuilder('SET_LAYOUT', {layout})
            .set('layers.layout', layout)
            .dispatch()
    }

    addImage() {
        console.log('addImage')
    }

    toggleShown(image) {
        const {layout, images} = this.props
        const shown = image.shown
        const actionBuilder = this.actionBuilder('TOGGLE_SHOWN', {image})

        if (!shown && layout === 'single') {

        }
        actionBuilder
            .set(['layers', 'images', {id: image.id}, 'shown'], !shown)
            .dispatch()
    }

    actionBuilder(type, props) {
        const {recipeId} = this.props
        return recipeActionBuilder(recipeId)(type, props)
    }

    componentDidMount() {
        // TODO: Dummy setup
        this.actionBuilder('SETUP_DUMMY_LAYERS')
            .set('layers', {
                layout: 'single',
                images: [
                    {id: guid(), type: 'GEE', title: 'This recipe', bands: ['RED', 'GREEN', 'BLUE'], shown: true},
                    {
                        id: guid(),
                        type: 'GEE',
                        title: 'Another Mosaic with a bit longer name',
                        bands: ['NIR', 'SWIR1', 'RED']
                    },
                    {id: guid(), type: 'PLANET', title: 'Planet', description: 'Analytic mosaic'}
                ]

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
        const {layer: {id, title, description}, show, onToggleShow} = this.props
        const showButton =
            <Button
                key='show'
                chromeless
                shape='circle'
                size='large'
                icon={show ? 'eye' : 'eye-slash'}
                onClick={onToggleShow}
            />
        return (
            <SuperButton
                key={id}
                title={<div className={styles.layerTitle}>{title}</div>}
                description={description || this.renderBands()}
                extraButtons={[showButton]}
                onClick={() => console.log('click')}
                onRemove={() => console.log('remove')}
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

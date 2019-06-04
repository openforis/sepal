import {withRecipe} from 'app/home/body/process/recipeContext'
import {compose} from 'compose'
import guid from 'guid'
import _ from 'lodash'
import React from 'react'
import {Button} from 'widget/button'
import {Buttons} from 'widget/buttons'
import Icon from 'widget/icon'
import Label from 'widget/label'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import Slider from 'widget/slider'
import Sortable from 'widget/sortable'
import SuperButton from 'widget/superButton'
import styles from './layerManagement.module.css'

const mapRecipeToProps = recipe => {
    return {}
}

const dummyMapLayers = [
    {id: guid(), type: 'GEE', title: 'This recipe', description: 'My Mosaic', bands: ['RED', 'GREEN', 'BLUE']},
    {
        id: guid(),
        type: 'GEE',
        title: 'Sepal recipe',
        description: 'Another Mosaic with a bit longer name',
        bands: ['NIR', 'SWIR1', 'RED']
    },
    {id: guid(), type: 'PLANET', title: 'Planet', description: 'Analytic mosaic'}
]

class LayerManagement extends React.Component {
    state = {
        hover: false,
        layout: '1x1'
    }

    render() {
        const {hover} = this.state
        // return hover ? this.renderOpenedPanel() : this.renderCollapsedPanel()
        return this.renderOpenedPanel()
    }

    renderCollapsedPanel() {
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
                        title={`${dummyMapLayers.length} layers`}/>
                </div>
            </Panel>
        )
    }

    renderOpenedPanel() {
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
                        title={`${dummyMapLayers.length} layers`}/>
                    <PanelContent>
                        {this.renderLayoutButtons()}
                        {this.renderMapLayers()}

                        <Label>
                            Features
                        </Label>
                    </PanelContent>
                </Panel>
            </div>
        )
    }

    renderLayoutButtons() {
        const {layout} = this.state
        const options = [
            {value: '1x1', label: <Icon name='square-full'/>},
            {value: '2x1', label: <Icon name='pause'/>},
            {value: '1x2', label: <Icon name='pause' className={styles.rotate90}/>},
            {value: '2x2', label: <Icon name='th-large'/>}
        ]
        return (
            <Buttons
                selected={layout}
                size='xx-large'
                onChange={layout => this.setLayout(layout)}
                options={options}
                className={styles.layoutButtons}/>
        )
    }

    renderMapLayers() {
        return (
            <div>
                <div className={styles.layersListHeader}>
                    <Label msg='Map layers'/>
                    <Button
                        shape='circle'
                        look='add'
                        size='small'
                        icon='plus'
                        onClick={() => this.addMapLayer()}
                    />
                </div>
                <Sortable items={dummyMapLayers}>
                    {mapLayer => <Layer layer={mapLayer}/>}
                </Sortable>
            </div>
        )
    }

    setLayout(layout) {
        this.setState({layout})
    }

    addMapLayer() {
        console.log('addMapLayer')
    }
}

export default compose(
    LayerManagement,
    withRecipe(mapRecipeToProps)
)


class Layer extends React.Component {
    state = {
        showOpacityControls: false
    }

    render() {
        const {layer: {id, title, description}} = this.props
        const {showOpacityControls} = this.state
        const showButton =
            <Button
                key='show'
                chromeless
                shape='circle'
                size='large'
                icon='eye'
                onClick={() => this.toggleShowLayer()}
            />
        const opacityButton =
            <Button
                key='opacity'
                chromeless={!showOpacityControls}
                look={showOpacityControls ? 'highlight' : 'default'}
                shape='circle'
                size='large'
                icon='adjust'
                onClick={() => this.toggleOpacityControls()}
            />
        return (
            <SuperButton
                key={id}
                title={<div className={styles.layerTitle}>{title}</div>}
                description={description}
                extraButtons={[showButton, opacityButton]}
                onClick={() => console.log('click')}
                onRemove={() => console.log('remove')}
                removeMessage={'Are you sure you want to remove this layer?'}
                className={styles.layer}>
                <div className={styles.layerContent}>
                    {showOpacityControls ? this.renderOpacityControls() : this.renderLayerContent()}
                </div>

            </SuperButton>
        )
    }

    renderOpacityControls() {
        return (
            <Slider input={{set: () => null}} ticks={[0, 25, 50, 75, 100]}/>
        )
    }

    renderLayerContent() {
        const {layer: {type}} = this.props
        switch (type) {
            case 'GEE':
                return this.renderGEELayer()
            case 'PLANET':
                return this.renderPlanetLayer()
            default:
                throw Error('Unknown layer type: ' + JSON.stringify(this.props.layer))
        }
    }

    renderGEELayer() {
        const {layer: {bands}} = this.props
        const bandClasses = ['red', 'green', 'blue']

        const bandElements = _.zip(bands, bandClasses).map(([band, className]) =>
            <div key={className} className={styles[className]}>
                {band}
            </div>
        )
        return (
            <div className={styles.rgbBands}>
                {bandElements}
            </div>
        )
    }

    renderPlanetLayer() {
        return (
            <div className={styles.rgbBands}>
                Year: 2016, Least cloudy
            </div>
        )
    }

    toggleOpacityControls() {
        this.setState(prevState => ({
            showOpacityControls: !prevState.showOpacityControls
        }))
    }

    toggleShowLayer() {
        console.log('toggleShowLayer')
    }
}

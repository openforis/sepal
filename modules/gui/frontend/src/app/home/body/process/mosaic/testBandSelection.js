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
import SuperButton from 'widget/superButton'
import styles from './testBandSelection.module.css'

const mapRecipeToProps = recipe => {
    return {}
}

class BandSelection extends React.Component {
    render() {
        return (
            <Panel
                id={'bandSelection'}
                className={styles.panel}
                type='bottom-center'>
                <PanelHeader
                    icon='layer-group'
                    title='4 layers'/>
                <PanelContent>
                    {this.renderLayoutButtons()}
                    {this.renderMapLayers()}

                    <Label>
                        Features
                    </Label>
                </PanelContent>
            </Panel>
        )
    }

    renderLayoutButtons() {
        const options = [
            {value: '1x1', label: <Icon name='square-full'/>},
            {value: '2x1', label: <Icon name='pause'/>},
            {value: '2x1', label: <Icon name='pause' className={styles.rotate90}/>},
            {value: '2x2', label: <Icon name='th-large'/>}
        ]
        return (
            <Buttons
                size='xx-large'
                onChange={option => this.changeDisplayType(option)}
                options={options}
                className={styles.layoutButtons}/>
        )
    }

    renderMapLayers() {
        const mapLayers = [
            {id: guid(), title: 'My Mosaic', bands: ['RED', 'GREEN', 'BLUE']},
            {id: guid(), title: 'Another Mosaic with a bit longer name', bands: ['NIR', 'SWIR1', 'RED']},
        ]
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
                <div>
                    {mapLayers.map(mapLayer => this.renderMapLayer(mapLayer))}
                </div>
            </div>
        )
    }

    renderMapLayer({id, title, bands}) {
        const opacityButton =
            <Button
                chromeless
                shape='circle'
                size='large'
                icon='adjust'
                onClick={() => this.showOpacityControls(id)}
            />
        const showButton =
            <Button
                chromeless
                shape='circle'
                size='large'
                icon='eye'
                onClick={() => this.toggleShowLayer(id)}
            />
        return (
            <SuperButton
                key={id}
                title={<div className={styles.layerTitle}>{title}</div>}
                extraButtons={[showButton, opacityButton]}
                onClick={() => console.log('click')}
                onRemove={() => console.log('remove')}
            >
                {this.renderRgbBands(bands)}
            </SuperButton>
        )
    }

    renderRgbBands(bands) {
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

    changeDisplayType(option) {
        console.log('changeDisplayType', option)
    }

    showOpacityControls(id) {
        console.log('showOpacityControls')
    }

    toggleShowLayer(id) {
        console.log('toggleShowLayer')
    }

    addMapLayer() {
        console.log('addMapLayer')
    }
}

export default compose(
    BandSelection,
    withRecipe(mapRecipeToProps)
)

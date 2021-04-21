import {Button} from 'widget/button'
import {Buttons} from 'widget/buttons'
import {Item} from 'widget/item'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {compose} from 'compose'
import {getImageLayerSource} from './imageLayerSource/imageLayerSource'
import {msg} from '../../../translate'
import {recipePath} from '../body/process/recipe'
import {withLayers} from '../body/process/withLayers'
import {withRecipe} from '../body/process/recipeContext'
import ButtonSelect from 'widget/buttonSelect'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from '../../../action-builder'
import styles from './mapControls.module.css'

class _MapAreaMenu extends React.Component {
    render() {
        return (
            <Panel className={styles.panel} type='normal'>
                {this.renderImageLayerSource()}
                <Panel.Content>
                    <Layout>
                        {this.renderImageLayerForm()}
                        {this.renderFeatureLayers()}
                    </Layout>
                </Panel.Content>
            </Panel>
        )
    }

    renderImageLayerSource() {
        const {imageLayerSources, layers: {areas}, area, recipe} = this.props
        const {imageLayer} = areas[area]
        const imageLayerSourceOptions = imageLayerSources.map(source => {
            const {id, type} = source
            const {description} = getImageLayerSource({recipe, source})
            return ({
                value: id,
                label: (
                    <div>
                        <Item
                            title={<div className={styles.title}>{msg(`imageLayerSources.${type}`)}</div>}
                            description={description}
                        />
                    </div>
                )
            })
        })
        const imageLayerSource = imageLayerSourceOptions.find(({value}) => value === imageLayer.sourceId).label
        return (
            <ButtonSelect
                className={styles.imageLayerSource}
                label={imageLayerSource}
                options={imageLayerSourceOptions}
                chromeless
                alignment={'left'}
                width={'fill'}
                onSelect={({value}) => this.selectImageLayer(value)}
            />
        )
        // return (
        //     <ButtonSelect
        //         className={styles.imageLayerSource}
        //         label={imageLayerSource}
        //         options={imageLayerSourceOptions}
        //         disabled={!imageLayerSourceOptions.length}
        //         value={imageLayer.sourceId}
        //         optionConverter={({description}) => description}
        //         onChange={option => {
        //             console.log(option)
        //         }}
        //     />

    }

    renderImageLayerForm() {
        const {form} = this.props
        return form
    }

    renderFeatureLayers() {
        const {area, featureLayerSources, layers: {areas}} = this.props
        const {featureLayers} = areas[area]
        const selectedSourceIds = featureLayers.map(({sourceId}) => sourceId)

        const options = featureLayerSources.map(({id, type, description}) => ({
            value: id,
            label: type, // TODO: Use message source
            tooltip: description
        }))

        return (
            <Buttons
                alignment='fill'
                multiple
                selected={selectedSourceIds}
                options={options}
                onChange={sourceIds =>
                    this.setFeatureLayers(sourceIds.map(sourceId => ({sourceId})))
                }
            />
        )
    }

    setFeatureLayers(sourceIds) {
        const {recipeId, area} = this.props
        actionBuilder('SET_FEATURE_LAYERS', {sourceIds, area})
            .set([recipePath(recipeId), 'layers.areas', area, 'featureLayers'], sourceIds)
            .dispatch()
    }

    selectImageLayer(sourceId) {
        const {recipeId, area} = this.props
        actionBuilder('SELECT_IMAGE_LAYER', {sourceId, area})
            .set(recipePath(recipeId, ['layers.areas', area, 'imageLayer']), {sourceId})
            .dispatch()
    }
}

const MapAreaMenu = compose(
    _MapAreaMenu,
    withLayers(),
    withRecipe(recipe => ({recipe}))
)

export class MapControls extends React.Component {
    render() {
        const {area, form} = this.props
        return (
            <div className={styles.container}>
                <div className={styles.content}>
                    <Button
                        look='default'
                        shape='pill'
                        icon='bars'
                        tooltip={<MapAreaMenu area={area} form={form}/>}
                        tooltipRaw
                    />
                </div>
            </div>
        )
    }
}

MapControls.propTypes = {
    area: PropTypes.string,
    form: PropTypes.object
}

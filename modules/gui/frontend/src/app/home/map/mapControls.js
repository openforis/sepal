import {Button} from 'widget/button'
import {Item} from 'widget/item'
import {Menu} from 'widget/menu/menu'
import {compose} from 'compose'
import {recipePath} from '../body/process/recipe'
import {selectFrom} from 'stateUtils'
import {withRecipe} from '../body/process/recipeContext'
import ButtonSelect from 'widget/buttonSelect'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from '../../../action-builder'
import styles from './mapControls.module.css'

const mapRecipeToProps = recipe => ({
    imageLayerSources: selectFrom(recipe, 'ui.imageLayerSources'),
    featureLayerSources: selectFrom(recipe, 'ui.featureLayerSources'),
    layers: selectFrom(recipe, 'layers')
})

class _MapAreaMenu extends React.Component {
    render() {
        return (
            <Menu>
                {this.renderImageLayerSource()}
                <Menu.Separator/>
                {this.renderImageLayerForm()}
                <Menu.Separator/>
                {this.renderFeatureLayers()}
            </Menu>
        )
    }

    renderFeatureLayers() {
        const {area, featureLayerSources, layers} = this.props
        const {featureLayers} = layers[area]
        const selectedSourceIds = featureLayers.map(({sourceId}) => sourceId)
        return featureLayerSources.map(({id, type, description}) =>
            <Menu.Toggle
                key={id}
                label={type}
                description={description}
                selected={selectedSourceIds.includes(id)}
                onChange={shown => this.toggleFeatureLayer({sourceId: id, shown})}
            />
        )
    }

    renderImageLayerForm() {
        const {form} = this.props
        return form
    }

    renderImageLayerSource() {
        const {imageLayerSources, layers, area} = this.props
        const {imageLayer} = layers[area]
        const imageLayerSourceOptions = imageLayerSources.map(({id, type, description}) => ({
            value: id,
            label: (
                <div style={{textAlign: 'left'}}>
                    <Item
                        title={<div className={styles.title}>{type}</div>}
                        description={description}
                    />
                </div>
            )
        }))
        const imageLayerSource = imageLayerSourceOptions.find(({value}) => value === imageLayer.sourceId).label
        return (
            <ButtonSelect
                // className={styles.imageLayerSource}
                label={imageLayerSource}
                options={imageLayerSourceOptions}
                chromeless
                alignment={'left'}
                width={'fill'}
                onSelect={({value}) => this.selectImageLayer(value)}
            />
        )
    }

    toggleFeatureLayer({sourceId, shown}) {
        const {recipeId, area} = this.props
        if (shown) {
            actionBuilder('ADD_FEATURE_LAYER', {sourceId, shown, area})
                .push([recipePath(recipeId), 'layers', area, 'featureLayers'], {sourceId})
                .dispatch()
        } else {
            actionBuilder('REMOVE_FEATURE_LAYER', {sourceId, area})
                .del([recipePath(recipeId), 'layers', area, 'featureLayers', {sourceId}])
                .dispatch()
        }
    }

    selectImageLayer(sourceId) {
        const {recipeId, area} = this.props
        actionBuilder('SELECT_IMAGE_LAYER', {sourceId, area})
            .set(recipePath(recipeId, ['layers', area, 'test.imageLayer']), {sourceId})
            .dispatch()
    }
}

const MapAreaMenu = compose(
    _MapAreaMenu,
    withRecipe(mapRecipeToProps)
)

export class MapControls extends React.Component {
    render() {
        const {area, form} = this.props
        return (
            <div className={styles.container}>
                <div className={styles.content}>
                    <Button
                        look='transparent'
                        shape='pill'
                        icon='bars'
                        tooltip={<MapAreaMenu area={area} form={form}/>}
                        // onClick={() => log.debug('options', area)}
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

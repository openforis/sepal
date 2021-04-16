import {Button} from 'widget/button'
import {Buttons} from 'widget/buttons'
import {ImageLayerSource} from './imageLayerSource'
import {Item} from 'widget/item'
import {Layout} from 'widget/layout'
import {Menu} from 'widget/menu/menu'
import {Panel} from 'widget/panel/panel'
import {Widget} from 'widget/widget'
import {compose} from 'compose'
import {msg} from '../../../translate'
import {recipePath} from '../body/process/recipe'
import {selectFrom} from 'stateUtils'
import {withRecipe} from '../body/process/recipeContext'
import ButtonSelect from 'widget/buttonSelect'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from '../../../action-builder'
import styles from './mapControls.module.css'

const mapRecipeToProps = recipe => ({
    imageLayerSources: [
        ...selectFrom(recipe, 'ui.imageLayerSources') || [],
        ...selectFrom(recipe, 'layers.additionalImageLayerSources') || []
    ],
    featureLayerSources: selectFrom(recipe, 'ui.featureLayerSources'),
    areas: selectFrom(recipe, 'layers.areas')
})

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
        const {imageLayerSources, areas, area} = this.props
        const {imageLayer} = areas[area]
        const imageLayerSourceOptions = imageLayerSources.map(source => {
            const {id, type} = source
            return ({
                value: id,
                label: (
                    <div>
                        <Item
                            title={<div className={styles.title}>{msg(`imageLayerSources.${type}`)}</div>}
                            description={<ImageLayerSource source={source} output={'DESCRIPTION'}/>}
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
    }

    renderImageLayerForm() {
        const {form} = this.props
        return form
    }

    renderFeatureLayers() {
        const {area, featureLayerSources, areas} = this.props
        const {featureLayers} = areas[area]
        const selectedSourceIds = featureLayers.map(({sourceId}) => sourceId)

        const options = featureLayerSources.map(({id, type, description}) => ({
            value: id,
            label: type, // TODO: Use message source
            tooltip: description
        }))
        return (
            <Buttons
                selected={[]}
                options={options}
                onChange={sourceId =>
                    sourceId && this.toggleFeatureLayer({sourceId, shown: !selectedSourceIds.includes(sourceId)})
                }
            />
        )
    }

    toggleFeatureLayer({sourceId, shown}) {
        console.log({sourceId, shown})
        const {recipeId, area} = this.props
        if (shown) {
            actionBuilder('ADD_FEATURE_LAYER', {sourceId, shown, area})
                .push([recipePath(recipeId), 'layers.areas', area, 'featureLayers'], {sourceId})
                .dispatch()
        } else {
            actionBuilder('REMOVE_FEATURE_LAYER', {sourceId, area})
                .del([recipePath(recipeId), 'layers.areas', area, 'featureLayers', {sourceId}])
                .dispatch()
        }
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
    withRecipe(mapRecipeToProps)
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

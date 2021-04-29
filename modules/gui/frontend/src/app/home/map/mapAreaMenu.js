import {Activator} from 'widget/activation/activator'
import {Button} from 'widget/button'
import {Buttons} from 'widget/buttons'
import {Combo} from 'widget/combo'
import {Item} from '../../../widget/item'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {activatable} from 'widget/activation/activatable'
import {compose} from 'compose'
import {getImageLayerSource} from './imageLayerSource/imageLayerSource'
import {msg} from 'translate'
import {recipePath} from '../body/process/recipe'
import {withLayers} from '../body/process/withLayers'
import {withRecipe} from '../body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from 'action-builder'
import styles from './mapAreaMenu.module.css'

class _MapAreaMenuPanel extends React.Component {
    render() {
        const {activatable: {deactivate}} = this.props
        return (
            <Panel className={styles.panel} type='normal'>
                <Panel.Content>
                    <Layout>
                        {this.renderImageLayerSource()}
                        {this.renderImageLayerForm()}
                        {this.renderFeatureLayers()}
                    </Layout>
                </Panel.Content>
                <Panel.Buttons onEscape={deactivate} shown={false}></Panel.Buttons>
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
                type,
                label: description,
                searchableText: `${msg(`imageLayerSources.${type}`)} ${description}`,
                render: () =>
                    <div className={styles.imageLayerSourceOption}>
                        <Item title={msg(`imageLayerSources.${type}`)} description={description}/>
                    </div>
            })
        })

        const {label, type} = imageLayerSourceOptions.find(({value}) => value === imageLayer.sourceId)
        return (
            <Combo
                label={msg(`imageLayerSources.${type}`)}
                placeholder={label}
                options={imageLayerSourceOptions}
                value={imageLayer.sourceId}
                onChange={({value}) => this.selectImageLayer(value)}
            />
        )
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
            label: msg(`featureLayerSources.${type}.type`),
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

const policy = () => ({
    _: 'allow-then-deactivate'
})

export const MapAreaMenuPanel = compose(
    _MapAreaMenuPanel,
    withLayers(),
    withRecipe(recipe => ({recipe})),
    activatable({
        id: ({area}) => `mapAreaMenu-${area}`,
        policy
    })

)

export class MapAreaMenu extends React.Component {
    render() {
        const {area, form} = this.props
        return (
            <div className={styles.container}>
                <div className={styles.content}>
                    <MapAreaMenuPanel area={area} form={form}/>
                    <Activator id={`mapAreaMenu-${area}`}>
                        {activator => {
                            const {activate, deactivate, active, canActivate} = activator
                            return (
                                <Button
                                    look='default'
                                    shape='pill'
                                    icon='bars'
                                    disabled={!canActivate && !active}
                                    onClick={() => active ? deactivate() : activate()}
                                />
                            )
                        }}
                    </Activator>
                </div>
            </div>
        )
    }
}

MapAreaMenu.propTypes = {
    area: PropTypes.string,
    form: PropTypes.object
}

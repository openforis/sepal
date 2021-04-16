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
                <Panel.Header icon='bars' title='Map area options'/> {/* TODO: replace with msg */}
                <Panel.Content>
                    <Layout>
                        <Widget label='Layer'>
                            {this.renderImageLayerSource()}
                        </Widget>
                        <Widget label='Layer options'>
                            {this.renderImageLayerForm()}
                        </Widget>
                        <Widget label='Layer features'>
                            {this.renderFeatureLayers()}
                        </Widget>
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
                    <div style={{textAlign: 'left'}}>
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

    renderImageLayerForm() {
        const {form} = this.props
        return form
    }

    renderFeatureLayers() {
        const {area, featureLayerSources, areas} = this.props
        const {featureLayers} = areas[area]
        const selectedSourceIds = featureLayers.map(({sourceId}) => sourceId)

        // const options = featureLayerSources.map(({id, type, description}) => ({value: id, label: type}))

        // return (
        //     <Buttons
        //         selected={selectedSourceIds}
        //         onChange={value => console.log('onChange', value)}
        //         options={options}
        //     />
        // )
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

    toggleFeatureLayer({sourceId, shown}) {
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

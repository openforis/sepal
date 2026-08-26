import React from 'react'

import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {withActivatable} from '~/widget/activation/activatable'
import {Buttons} from '~/widget/buttons'
import {Panel} from '~/widget/panel/panel'

import styles from './labelsLayerOptionsPanel.module.css'
import {LABELS_CATEGORIES, resolveLabelsStyle, withUpdatedLabelsCategories} from './layer/labelsLayerStyle'

const LABELS_SOURCE_ID = 'labels'

const mapRecipeToProps = (recipe, {area}) => {
    const featureLayers = selectFrom(recipe, ['layers.areas', area, 'featureLayers']) || []
    const featureLayer = featureLayers.find(({sourceId}) => sourceId === LABELS_SOURCE_ID)
    return {
        recipeId: selectFrom(recipe, 'id'),
        layerConfig: featureLayer && featureLayer.layerConfig
    }
}

const toEnabled = categories => LABELS_CATEGORIES.filter(category => categories[category] !== false)

const toCategories = enabled =>
    Object.fromEntries(LABELS_CATEGORIES.map(category => [category, enabled.includes(category)]))

// The Labels layer's own options: which Google feature groups it draws. There is no opacity here or
// anywhere else for labels - a Google StyledMapType exposes no opacity control.
class _LabelsLayerOptionsPanel extends React.Component {
    constructor(props) {
        super(props)
        this.state = {enabled: toEnabled(resolveLabelsStyle(props.layerConfig).categories)}
        this.apply = this.apply.bind(this)
    }

    render() {
        const {activatable: {deactivate}} = this.props
        const {enabled} = this.state
        return (
            <Panel className={styles.panel} placement='modal' onBackdropClick={deactivate}>
                <Panel.Header
                    icon='palette'
                    title={msg('featureLayerSources.Labels.type')}
                />
                <Panel.Content>
                    <Buttons
                        label={msg('map.labelsLayerStyle.categories.label')}
                        multiple
                        layout='vertical'
                        alignment='fill'
                        spacing='tight'
                        selected={enabled}
                        options={LABELS_CATEGORIES.map(value => ({
                            value,
                            label: msg(`map.labelsLayerStyle.categories.${value}`)
                        }))}
                        onChange={enabled => this.setState({enabled})}
                    />
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Cancel keybinding='Escape' onClick={deactivate}/>
                        <Panel.Buttons.Apply keybinding='Enter' onClick={this.apply}/>
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }

    apply() {
        const {recipeId, area, activatable: {deactivate}} = this.props
        const {enabled} = this.state
        recipeActionBuilder(recipeId)('SET_LABELS_LAYER_OPTIONS', {area})
            .set(
                ['layers.areas', area, 'featureLayers', {sourceId: LABELS_SOURCE_ID}, 'layerConfig.style'],
                withUpdatedLabelsCategories(toCategories(enabled))
            )
            .dispatch()
        deactivate()
    }
}

const policy = () => ({_: 'allow'})

export const LabelsLayerOptionsPanel = compose(
    _LabelsLayerOptionsPanel,
    withRecipe(mapRecipeToProps),
    withActivatable({
        id: ({area}) => `labelsLayerOptions-${area}`,
        policy,
        alwaysAllow: true
    })
)

import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {NICFI_ASSETS} from 'app/home/body/process/recipe/planetMosaic/planetMosaicRecipe'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {msg} from 'translate'
import {getDataSetOptions as planetDataSetOptions} from 'app/home/body/process/recipe/planetMosaic/sources'
import {selectFrom} from 'stateUtils'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './sources.module.css'

const fields = {
    source: new Form.Field(),
    asset: new Form.Field()
        .skip((v, {source}) => source === 'NICFI')
        .notBlank(),
    validAsset: new Form.Field()
        .skip((v, {source}) => source === 'NICFI')
        .notBlank(),
}

const mapRecipeToProps = recipe => ({
    dates: selectFrom(recipe, 'model.dates')
})

class Sources extends React.Component {
    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='satellite-dish'
                    title={msg('process.planetMosaic.panel.sources.title')}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {inputs: {source}} = this.props
        return (
            <Layout>
                {this.renderSources()}
                {source.value !== 'NICFI'
                    ? this.renderAssetId()
                    : null}
            </Layout>
        )
    }

    renderSources() {
        const {dates, inputs: {source}} = this.props
        const options = planetDataSetOptions(dates)
        return (
            <Form.Buttons
                label={msg('process.planetMosaic.panel.sources.form.collectionType.label')}
                input={source}
                options={options}
            />
        )
    }

    renderAssetId() {
        const {inputs: {asset, validAsset}} = this.props
        return (
            <Form.AssetCombo
                input={asset}
                label={msg('process.planetMosaic.panel.sources.form.asset.label')}
                placeholder={msg('process.planetMosaic.panel.sources.form.asset.placeholder')}
                expectedType='ImageCollection'
                autoFocus
                onLoading={() => validAsset.set('')}
                onLoaded={() => validAsset.set('valid')}
            />
        )
    }

    componentDidMount() {
        const {inputs: {source, validAsset}} = this.props
        if (!source.value) {
            source.set('NICFI')
        }
        validAsset.set('valid')
    }
}

const valuesToModel = values => {
    const nicfiSource = values.source === 'NICFI'
    return {
        source: nicfiSource ? 'BASEMAPS' : values.source,
        assets: nicfiSource ? NICFI_ASSETS : [values.asset]
    }
}

const modelToValues = model => {
    const nicfiSource = _.isEqual(model.assets, NICFI_ASSETS)
    return {
        source: nicfiSource ? 'NICFI' : model.source,
        asset: nicfiSource || _.isEmpty(model.assets) ? null : model.assets[0],
        validAsset: true
    }
}

Sources.propTypes = {
    recipeId: PropTypes.string
}

export default compose(
    Sources,
    recipeFormPanel({id: 'sources', fields, mapRecipeToProps, modelToValues, valuesToModel})
)

import {BandSpec} from './bandSpec'
import {Layout} from 'widget/layout'
import {bandsAvailableToAdd, defaultBand} from 'app/home/body/process/recipe/remapping/remappingRecipe'
import {compose} from 'compose'
import {withScrollable} from 'widget/scrollable'
import PropTypes from 'prop-types'
import React, {Component} from 'react'
import _ from 'lodash'

class ImageForm extends Component {
    state = {
        loadedRecipe: null,
        selected: undefined,
    }

    render() {
        return (
            <Layout type={'vertical'}>
                {this.renderImageSelector()}
                {this.renderIncludedBands()}
            </Layout>
        )
    }

    renderImageSelector() {
        const {input, inputComponent, inputs: {bands}} = this.props
        return <div ref={this.element}>
            {React.createElement(inputComponent, {
                input,
                onLoading: () => {
                    bands.set({})
                },
                onLoaded: ({
                    id,
                    bands,
                    visualizations,
                    recipe
                }) => this.onLoaded(id, bands, visualizations, recipe)
            })}
        </div>
    }

    renderIncludedBands() {
        const {inputs: {bands, includedBands}} = this.props
        const {loadedRecipe, selected} = this.state
        const availableBands = bandsAvailableToAdd(bands.value, includedBands.value)
        return (
            <Layout type='vertical' spacing='tight'>
                {(includedBands.value || []).map(bandSpec =>
                    <BandSpec
                        key={bandSpec.band}
                        bands={_.omit(bands.value, Object.keys(bands.value)
                            .filter(b => ![bandSpec.band, ...availableBands].includes(b))) || {}}
                        recipe={loadedRecipe}
                        spec={bandSpec}
                        selected={selected === bandSpec.id}
                        disabled={!Object.keys(bands.value).length}
                        onClick={id => this.selectBandSpec(id)}
                        onUpdate={spec => this.updateSpec(spec)}
                        onRemove={id => this.removeBandSpec(id)}/>
                )}
            </Layout>
        )
    }

    componentDidUpdate(prevProps) {
        const {inputs: {includedBands: prevIncludedBands}} = prevProps
        const {inputs: {includedBands}} = this.props
        if ((includedBands.value || []).length > (prevIncludedBands.value || []).length) {
            // A band was added - select last
            this.selectBandSpec(includedBands.value[includedBands.value.length - 1].id)
        }
    }

    updateSpec(updatedSpec) {
        const {inputs: {includedBands}} = this.props
        includedBands.set(includedBands.value
            .map(spec => spec.id === updatedSpec.id
                ? updatedSpec
                : spec
            ))
    }

    selectBandSpec(bandSpecId) {
        this.setState(({selected}) => ({
            selected: selected === bandSpecId ? null : bandSpecId
        }))
    }

    removeBandSpec(bandSpecId) {
        const {inputs: {includedBands}} = this.props
        includedBands.set(
            includedBands.value.filter(spec => spec.id !== bandSpecId)
        )
    }

    onLoaded(id, loadedBands, loadedVisualizations, loadedRecipe) {
        const {form, inputs: {bands, visualizations, recipe, includedBands}} = this.props
        if (!id || !form.isDirty()) {
            return
        }
        bands.set(loadedBands)
        visualizations.set(loadedVisualizations)
        recipe.set(loadedRecipe.id)
        this.setState({loadedRecipe})
        if (!includedBands.value?.length) {
            this.addFirstBand(loadedBands)
        }
        
    }

    addFirstBand(loadedBands) {
        const {inputs: {includedBands}} = this.props
        const availableBands = bandsAvailableToAdd(loadedBands, includedBands.value)
        const bandSpec = defaultBand(availableBands[0], loadedBands)
        includedBands.set([bandSpec])
        this.setState({selected: bandSpec.id})
    }
}

ImageForm.propTypes = {
    children: PropTypes.any,
    inputComponent: PropTypes.any,
    inputs: PropTypes.any
}

export default compose(
    ImageForm,
    withScrollable()
)

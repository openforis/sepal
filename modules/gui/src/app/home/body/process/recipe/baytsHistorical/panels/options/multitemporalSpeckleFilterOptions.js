import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {SubformDetails} from './subformDetails'
import {compose} from 'compose'
import {modalSubformPanel} from './modalSubformPanel'
import {msg} from 'translate'
import {withActivators} from 'widget/activation/activator'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './options.module.css'

const _MultitemporalSpeckleFilterOptions = ({
    spatialSpeckleFilter,
    multitemporalSpeckleFilter,
    inputs,
    activator: {activatables: {multitemporalSpeckleFilterOptions}}
}) => {
    const fields = filterFields({spatialSpeckleFilter, multitemporalSpeckleFilter, inputs}).map(name => ({
        label: msg(['process.baytsHistorical.panel.options.form.multitemporalSpeckleFilterOptions', name, 'label']),
        value: inputs[name].value
    }))
    return (
        <React.Fragment>
            <SubformDetails
                fields={fields}
                onClick={() => multitemporalSpeckleFilterOptions.activate()}/>
            <MultitemporalSpeckleFilterOptionsPanel
                spatialSpeckleFilter={spatialSpeckleFilter}
                multitemporalSpeckleFilter={multitemporalSpeckleFilter}
                inputsToUpdate={inputs}
            />
        </React.Fragment>
    )
}

export const MultitemporalSpeckleFilterOptions = compose(
    _MultitemporalSpeckleFilterOptions,
    withActivators('multitemporalSpeckleFilterOptions')
)

const filterFields = ({spatialSpeckleFilter, multitemporalSpeckleFilter}) => [
    (spatialSpeckleFilter && spatialSpeckleFilter !== 'NONE'
        && multitemporalSpeckleFilter && multitemporalSpeckleFilter !== 'NONE'
        ? ['numberOfImages'] : []),
].flat()

MultitemporalSpeckleFilterOptions.propTypes = {
    inputs: PropTypes.shape({
        numberOfImages: PropTypes.object.isRequired
    }).isRequired,
    multitemporalSpeckleFilter: PropTypes.any.isRequired,
    spatialSpeckleFilter: PropTypes.any.isRequired,
}

const fields = {
    numberOfImages: new Form.Field()
        .notBlank()
        .number()
}

class _MultitemporalSpeckleFilterOptionsPanel extends React.Component {
    render() {
        const {spatialSpeckleFilter, multitemporalSpeckleFilter, inputs} = this.props
        const fields = filterFields({spatialSpeckleFilter, multitemporalSpeckleFilter, inputs})
        
        return (
            <Layout>
                {fields.includes('numberOfImages') ? this.renderNumberOfImages() : null}
            </Layout>
        )
    }

    renderNumberOfImages() {
        const {inputs: {numberOfImages}} = this.props
        return (
            <Form.Slider
                label={msg('process.baytsHistorical.panel.options.form.multitemporalSpeckleFilterOptions.numberOfImages.label')}
                input={numberOfImages}
                minValue={2}
                maxValue={100}
                ticks={[1, 2, 5, 10, 20, 50, 100]}
                scale='log'
                info={value =>
                    msg('process.baytsHistorical.panel.options.form.multitemporalSpeckleFilterOptions.numberOfImages.value', {value})
                }
            />
        )
    }

}

const MultitemporalSpeckleFilterOptionsPanel = compose(
    _MultitemporalSpeckleFilterOptionsPanel,
    modalSubformPanel({
        id: 'multitemporalSpeckleFilterOptions',
        fields,
        toTitle: () => msg('process.baytsHistorical.panel.options.form.multitemporalSpeckleFilterOptions.title'),
        toClassName: () => styles.multitemporalSpeckleFilterOptionsPanel,
    })
)


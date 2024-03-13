import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {SubformDetails} from './subformDetails'
import {compose} from '~/compose'
import {modalSubformPanel} from './modalSubformPanel'
import {msg} from '~/translate'
import {withActivators} from '~/widget/activation/activator'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './options.module.css'

const _MaskOptions = ({inputs: {minAngle, maxAngle}, activator: {activatables: {maskOptions}}}) => {
    return (
        <React.Fragment>
            <SubformDetails
                fields={[
                    {
                        label: msg('process.radarMosaic.panel.options.form.maskOptions.minAngle.label'),
                        value: minAngle.value
                    },
                    {
                        label: msg('process.radarMosaic.panel.options.form.maskOptions.maxAngle.label'),
                        value: maxAngle.value
                    },
                ]}
                onClick={() => maskOptions.activate()}/>
            <MaskOptionsPanel inputsToUpdate={{minAngle, maxAngle}}/>
        </React.Fragment>
    )
}

export const MaskOptions = compose(
    _MaskOptions,
    withActivators('maskOptions')
)

MaskOptions.propTypes = {
    inputs: PropTypes.shape({
        maxAngle: PropTypes.object.isRequired,
        minAngle: PropTypes.object.isRequired,
    }).isRequired
}

const fields = {
    minAngle: new Form.Field()
        .notBlank()
        .number(),
    maxAngle: new Form.Field()
        .notBlank()
        .number()
}

class _MaskOptionsPanel extends React.Component {
    render() {
        const {inputs: {minAngle, maxAngle}} = this.props
        return (
            <Layout type='horizontal-nowrap'>
                <Form.Input
                    label={msg('process.radarMosaic.panel.options.form.maskOptions.minAngle.label')}
                    input={minAngle}
                />
                <Form.Input
                    label={msg('process.radarMosaic.panel.options.form.maskOptions.maxAngle.label')}
                    input={maxAngle}
                />
            </Layout>
        )
    }
}

const MaskOptionsPanel = compose(
    _MaskOptionsPanel,
    modalSubformPanel({
        id: 'maskOptions',
        fields,
        toTitle: () => msg('process.radarMosaic.panel.options.form.maskOptions.title'),
        toClassName: () => styles.maskOptionsPanel,
    })
)


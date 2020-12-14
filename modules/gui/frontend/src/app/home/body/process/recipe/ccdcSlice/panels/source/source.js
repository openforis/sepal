import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {msg} from 'translate'
import {takeUntil} from 'rxjs/operators'
import React from 'react'
import _ from 'lodash'
import api from '../../../../../../../../api'
import styles from './source.module.css'

const fields = {
    asset: new Form.Field()
        .notEmpty('process.ccdcSlice.panel.source.form.asset.required'),
    bands: new Form.Field()
        .notEmpty('process.ccdcSlice.panel.source.form.bands.required'),
    dateFormat: new Form.Field(),
    startDate: new Form.Field(),
    endDate: new Form.Field(),
    surfaceReflectance: new Form.Field()
}

class Source extends React.Component {
    constructor(props) {
        super(props)
        this.assetChanged$ = new Subject()
    }

    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='cog'
                    title={msg('process.ccdcSlice.panel.source.title')}/>
                <Panel.Content className={styles.content}>
                    <Layout>
                        {this.renderSource()}
                        <div/> {/* [HACK] Make sure widget messages are shown */}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderSource() {
        const {inputs: {asset, bands}} = this.props
        return (
            <Form.Input
                label={msg('process.ccdcSlice.panel.source.form.asset.label')}
                autoFocus
                input={asset}
                placeholder={msg('process.ccdcSlice.panel.source.form.asset.placeholder')}
                spellCheck={false}
                onChange={() => bands.set(null)}
                onChangeDebounced={asset => asset && this.loadMetadata(asset)}
                errorMessage
                busyMessage={this.props.stream('LOAD_ASSET_METADATA').active && msg('widget.loading')}
            />
        )
    }

    loadMetadata(asset) {
        this.props.stream('LOAD_ASSET_METADATA',
            api.gee.imageMetadata$({asset}).pipe(
                takeUntil(this.assetChanged$)),
            metadata => this.updateMetadata(metadata),
            error => {
                this.props.inputs.asset.setInvalid(
                    error.response
                        ? msg(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
                        : msg('asset.failedToLoad')
                )
            }
        )
    }

    updateMetadata(metadata) {
        const assetBands = _.intersection(...['coefs', 'magnitude', 'rmse']
            .map(postfix => metadata.bands
                .map(assetBand => assetBand.match(`(.*)_${postfix}`))
                .map(match => match && match[1])
                .filter(band => band)
            )
        )
        const {inputs: {asset, bands, dateFormat, startDate, endDate, surfaceReflectance}} = this.props
        if (assetBands) {
            bands.set(assetBands)
            dateFormat.set(metadata.dateFormat)
            startDate.set(metadata.startDate)
            endDate.set(metadata.endDate)
            surfaceReflectance.set(metadata.surfaceReflectance)
        } else {
            asset.setInvalid(msg('process.ccdcSlice.panel.source.form.asset.notCCDC'))
        }

    }
}

Source.propTypes = {}

export default compose(
    Source,
    recipeFormPanel({id: 'source', fields})
)

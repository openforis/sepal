import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {msg} from 'translate'
import React from 'react'
import styles from './source.module.css'
import api from '../../../../../../../api'
import {takeUntil} from 'rxjs/operators'
import {Subject} from 'rxjs'
import _ from 'lodash'

const fields = {
    asset: new Form.Field()
        .notEmpty('process.ccdcSlice.panel.source.form.asset.required'),
    bands: new Form.Field()
        .notEmpty('process.ccdcSlice.panel.source.form.bands.required')
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
                onChangeDebounced={asset => asset && this.loadBands(asset)}
                errorMessage
                busyMessage={this.props.stream('LOAD_BANDS').active && msg('widget.loading')}
            />
        )
    }

    loadBands(asset) {
        this.props.stream('LOAD_BANDS',
            api.gee.bands$({asset}).pipe(
                takeUntil(this.assetChanged$)),
            assetBand => this.extractBands(assetBand),
            error => {
                console.log('ERROR', error)
                this.props.inputs.asset.setInvalid(
                    error.response
                        ? msg(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
                        : msg('asset.failedToLoad')
                )
            }
        )
    }

    extractBands(assetBand) {
        const bands = _.intersection(...['coefs', 'magnitude', 'rmse']
            .map(postfix => assetBand
                .map(assetBand => assetBand.match('(.*)_' + postfix))
                .map(match => match && match[1])
                .filter(band => band)
            )
        )
        if (bands) {
            this.props.inputs.bands.set(bands)
        } else {
            this.props.inputs.asset.setInvalid(msg('process.ccdcSlice.panel.source.form.asset.notCCDC'))
        }

    }
}


Source.propTypes = {}

export default compose(
    Source,
    recipeFormPanel({id: 'source', fields})
)

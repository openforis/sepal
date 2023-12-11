import {Form, withForm} from 'widget/form/form'
import {Panel} from './panel/panel'
import {compose} from 'compose'
import {msg} from 'translate'
import {withActivatable} from './activation/activatable'
import {withAssets} from './assets'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './assetBrowser.module.css'

const fields = {
    assetLocation: new Form.Field().notBlank()
}

class _AssetBrowser extends React.Component {
    constructor(props) {
        super(props)
        this.onApply = this.onApply.bind(this)
    }

    render() {
        const {form, activatable: {deactivate}} = this.props
        return (
            <Form.Panel
                className={styles.panel}
                form={form}
                onApply={this.onApply}
                onCancel={deactivate}
                modal>
                <Panel.Header title={msg('asset.browser.title')}/>
                <Panel.Content scrollable={false}>
                    {this.renderForm()}
                </Panel.Content>
                <Form.PanelButtons/>
            </Form.Panel>
        )
    }

    renderForm() {
        const {inputs: {assetLocation}} = this.props
        return (
            <Form.AssetLocation
                label={msg('asset.browser.assetLocation')}
                input={assetLocation}
            />
        )
    }

    onApply() {
        const {inputs: {assetLocation}, onChange, activatable: {deactivate}} = this.props
        const assetId = assetLocation.value
        onChange && onChange(assetId)
        deactivate()
    }

    componentDidMount() {
        this.update()
    }

    componentDidUpdate({activatable: {activatables: {assetBrowser: {activationProps: {assetId: prevAssetId}}}}}) {
        const {activatable: {activatables: {assetBrowser: {activationProps: {assetId}}}}} = this.props
        if (assetId !== prevAssetId) {
            this.update()
        }
    }

    update() {
        const {activatable: {activatables: {assetBrowser: {activationProps: {assetId}}}}, inputs: {assetLocation}} = this.props
        assetLocation.set(assetId)
    }
}

const policy = () => ({
    _: 'allow'
})

export const AssetBrowser = compose(
    _AssetBrowser,
    withForm({fields}),
    withAssets(),
    withActivatable({id: 'assetBrowser', policy, alwaysAllow: true})
)

AssetBrowser.propTypes = {
    onChange: PropTypes.func.isRequired,
    assetLocation: PropTypes.string
}

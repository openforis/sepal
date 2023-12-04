import {Form, withForm} from 'widget/form/form'
import {Layout} from './layout'
import {Panel} from './panel/panel'
import {compose} from 'compose'
import {msg} from 'translate'
import {withActivatable} from './activation/activatable'
import React from 'react'
import styles from './assetBrowser.module.css'

const fields = {
    assetName: new Form.Field().notBlank(),
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
                <Panel.Content>
                    {this.renderForm()}
                </Panel.Content>
                <Form.PanelButtons/>
            </Form.Panel>
        )
    }

    renderForm() {
        const {inputs: {assetName, assetLocation}} = this.props
        return (
            <Layout>
                <Form.AssetCombo
                    label={msg('asset.browser.assetLocation')}
                    mode='folder'
                    input={assetLocation}
                />
                <Form.Input
                    label={msg('asset.browser.assetName')}
                    input={assetName}
                />
            </Layout>
        )
    }

    onApply() {
        const {inputs: {assetName, assetLocation}, onChange, activatable: {deactivate}} = this.props
        const assetId = [assetLocation.value, assetName.value].join('/')
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
        const {activatable: {activatables: {assetBrowser: {activationProps: {assetId}}}}, inputs: {assetName, assetLocation}} = this.props
        const index = assetId.lastIndexOf('/')
        if (index !== -1) {
            assetLocation.set(assetId.substr(0, index))
            assetName.set(assetId.substr(index + 1))
        } else {
            assetName.set(assetId)
        }
    }
}

const policy = () => ({
    _: 'allow'
})

export const AssetBrowser = compose(
    _AssetBrowser,
    withForm({fields}),
    withActivatable({id: 'assetBrowser', policy, alwaysAllow: true})
)

import {Button} from 'widget/button'
import {Form} from 'widget/form/form'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {msg} from 'translate'
import React from 'react'
import styles from './options.module.css'

const fields = {
    advanced: new Form.Field(),
}

class Options extends React.Component {
    render() {
        const {inputs: {advanced}} = this.props
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='cog'
                    title={msg('process.baytsAlerts.panel.options.title')}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Form.PanelButtons>
                    <Button
                        label={advanced.value ? msg('button.less') : msg('button.more')}
                        onClick={() => this.setAdvanced(!advanced.value)}/>
                </Form.PanelButtons>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {inputs: {advanced}} = this.props
        return advanced.value ? this.renderAdvanced() : this.renderSimple()
    }

    renderSimple() {
        return (
            <React.Fragment>
                Simple
            </React.Fragment>
        )
    }

    renderAdvanced() {
        return (
            <React.Fragment>
                Advanced
            </React.Fragment>
        )
    }

    setAdvanced(enabled) {
        const {inputs: {advanced}} = this.props
        advanced.set(enabled)
    }
}

Options.propTypes = {}

export default compose(
    Options,
    recipeFormPanel({id: 'baytsAlertsOptions', fields})
)

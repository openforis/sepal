import React from 'react'
import {connect} from 'store'
import {msg} from 'translate'
import {activatable} from 'widget/activation/activatable'
import {Panel, PanelButtons, PanelContent, PanelHeader} from 'widget/panel'
import styles from './addImagery.module.css'

class _AddImagery extends React.Component {

    render() {
        const {activatable: {deactivate}} = this.props
        const close = () => deactivate()
        return (
            <Panel
                className={styles.panel}
                type='modal'>
                <PanelHeader
                    icon='image'
                    title={msg('process.classification.panel.imagery.add.title')}/>
                <PanelContent>
                    <div>Add</div>
                </PanelContent>
                <PanelButtons onEnter={close} onEscape={close}>
                    <PanelButtons.Main>
                        <PanelButtons.Close onClick={close}/>
                    </PanelButtons.Main>
                </PanelButtons>
            </Panel>
        )
    }
}

const policy = () => ({_: 'allow'})

const AddImagery = (
    activatable({id: 'addImagery', policy})(
        connect()(
            _AddImagery
        )
    )
)
export default AddImagery

AddImagery.propTypes = {}

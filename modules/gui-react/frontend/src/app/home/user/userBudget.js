import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import {connect} from 'store'
import {msg} from 'translate'
import Icon from 'widget/icon'
import Portal from 'widget/portal'
import React from 'react'
import Tooltip from 'widget/tooltip'
import actionBuilder from 'action-builder'
import styles from './userDetails.module.css'

const mapStateToProps = (state) => {
    return {
        userReport: state.currentUserReport,
        panel: state.ui && state.ui.userBudget,
        modal: state.ui && state.ui.modal
    }
}

const action = (mode) =>
    actionBuilder('USER_BUDGET')
        .set('ui.userBudget', mode)
        .set('ui.modal', !!mode)
        .dispatch()

export const showUserBudget = () => {
    action('USER_BUDGET')
}

export const closePanel = () =>
    action()

class UserBudget extends React.Component {
    buttonHandler() {
        const {panel, modal} = this.props
        if (!panel && !modal) {
            showUserBudget()
        } else {
            closePanel()
        }
    }

    renderPanel() {
        return (
            <Portal>
                <Panel className={styles.panel} center modal>
                    <PanelHeader
                        icon='user'
                        title={msg('user.userBudget.title')}/>
                    <PanelContent>
                        something here
                    </PanelContent>
                </Panel>
            </Portal>
        )
    }

    renderButton() {
        const {className, modal} = this.props
        return (
            <Tooltip msg='home.sections.user.info' disabled={modal}>
                <button className={className} onClick={() => this.buttonHandler()}>
                    <Icon name='dollar-sign'/> 0/h
                </button>
            </Tooltip>
        )
    }

    render() {
        const {panel} = this.props
        const showUserBudget = panel === 'USER_BUDGET'
        return (
            <React.Fragment>
                {this.renderButton()}
                {showUserBudget ? this.renderPanel() : null}
            </React.Fragment>
        )
    }
}

UserBudget.propTypes = {}

export default connect(mapStateToProps)(UserBudget)

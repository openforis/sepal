import React from 'react'
import ReactDOM from 'react-dom'
import PropTypes from 'prop-types'
import Tooltip from 'widget/tooltip'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import {msg} from 'translate'
import styles from './userProfile.module.css'

export default class UserProfile extends React.Component {
    state = {
        open: false
    }
    toggleOpen() {
        this.setState(prevState => ({...prevState, open: !this.state.open}))
    }
    renderButton() {
        const {className, user} = this.props
        const {open} = this.state
        return (
            <Tooltip msg='home.sections.user.profile' top>
                <button className={className} onClick={() => this.toggleOpen()}>
                    {user.username}
                </button>
            </Tooltip>
        )
    }
    renderPanel() {
        return (
            ReactDOM.createPortal(
                <React.Fragment>
                    <div className={styles.modal}>
                        <Panel className={styles.panel} center>
                            <PanelHeader
                                icon='user'
                                title={msg('user.panel.title')}/>
                            <PanelContent>
                                HELLO WORLD!
                            </PanelContent>
                            {/* <PanelButtons
                                form={form}
                                statePath={recipePath(recipeId, 'ui')}
                                onApply={trainingData => this.recipeActions.setTrainingData(trainingData).dispatch()}/> */}
                        </Panel>
                    </div>
                </React.Fragment>,
            document.body)
        )
    }
    render() {
        const {open} = this.state
        return (
            <React.Fragment>
                {this.renderButton()}
                {open ? this.renderPanel() : null}
            </React.Fragment>
        )
    }
}

UserProfile.propTypes = {
    className: PropTypes.string,
    user: PropTypes.object
}
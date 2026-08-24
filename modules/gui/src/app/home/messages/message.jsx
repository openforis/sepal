import PropTypes from 'prop-types'
import React from 'react'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Label} from '~/widget/label'
import {Layout} from '~/widget/layout'
import {Markdown} from '~/widget/markdown'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'
import {Shape} from '~/widget/shape'
import {Widget} from '~/widget/widget'

import styles from './message.module.css'

// Acknowledge (mark READ) a shown message: optimistic store update first, then a fire-and-forget
// POST detached from any component lifecycle — closing the panel (or the whole modal unmounting
// right after, as the urgent cascade does) must not cancel the acknowledgment.
const acknowledgeMessage = message => {
    const id = message.message.id
    actionBuilder('ACKNOWLEDGE_MESSAGE', {id})
        .assign(['user.messages', {message: {id}}], {state: 'READ'})
        .dispatch()
    api.message.updateState$({...message, state: 'READ'}).subscribe({
        error: error => Notifications.error({message: msg('message.updateState.error'), error})
    })
}

const fields = {
    subject: new Form.Field()
        .notBlank('message.form.subject.required'),
    contents: new Form.Field()
        .notBlank('message.form.contents.required'),
    priority: new Form.Field()
}

const mapStateToProps = (state, ownProps) => {
    const user = state.user.currentUser
    const message = ownProps.message
    return {
        user,
        values: {
            id: message && message.id,
            type: 'SYSTEM',
            subject: (message && message.subject) || '',
            contents: (message && message.contents) || '',
            // New messages start unpublished; an existing message keeps its stored priority
            // (including 0, so no || fallback here).
            priority: message && message.priority != null ? message.priority : -1,
            username: user.username
        }
    }
}

class _EditMessage extends React.Component {
    renderPriorityButtons() {
        const {inputs: {priority}} = this.props
        return (
            <Form.Buttons
                input={priority}
                options={[
                    {value: -1, label: msg('message.form.priority.unpublished')},
                    {value: 0, label: msg('message.form.priority.normal')},
                    {value: 1, label: msg('message.form.priority.urgent')}
                ]}
            />
        )
    }

    renderPreview() {
        const {inputs: {contents}} = this.props
        return (
            <Widget
                label={msg('message.form.preview.label')}
                framed>
                <Label/>
                <Markdown className={styles.contents} source={contents.value}/>
            </Widget>
        )
    }

    renderPanel() {
        const {inputs: {subject, contents}} = this.props
        return (
            <React.Fragment>
                <Panel.Content>
                    <Layout>
                        <Form.Input
                            label={msg('message.form.subject.label')}
                            autoFocus
                            input={subject}
                            spellCheck={false}
                        />
                        <Form.Input
                            label={msg('message.form.contents.label')}
                            input={contents}
                            textArea={true}
                            spellCheck={false}
                        />
                        {contents.value ? this.renderPreview() : null}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </React.Fragment>
        )
    }

    render() {
        const {form, onApply, onCancel} = this.props
        return (
            <Form.Panel
                className={styles.panel}
                placement='modal'
                form={form}
                statePath='message'
                onApply={message => onApply(message)}
                onCancel={onCancel}>
                <Panel.Header
                    icon='bell'
                    title={msg('message.title')}
                    label={this.renderPriorityButtons()}/>
                {this.renderPanel()}
            </Form.Panel>
        )
    }
}

export const EditMessage = compose(
    _EditMessage,
    withForm({fields, mapStateToProps})
)

EditMessage.propTypes = {
    message: PropTypes.object.isRequired,
    onApply: PropTypes.func,
    onCancel: PropTypes.func.isRequired
}

export class ShowMessage extends React.Component {
    constructor(props) {
        super(props)
        this.dismiss = this.dismiss.bind(this)
        this.implicitDismiss = this.implicitDismiss.bind(this)
    }

    dismiss() {
        const {message, onClose} = this.props
        acknowledgeMessage(message)
        onClose()
    }

    implicitDismiss() {
        const {important} = this.props
        if (!important) {
            this.dismiss()
        }
    }

    renderAcknowledged() {
        const {isAdmin, message: {acknowledged}} = this.props
        return isAdmin ? (
            <Shape shape='pill' disableHover>
                {msg('message.acknowledged', {count: acknowledged})}
            </Shape>
        ) : null
    }

    render() {
        const {message: {message: {subject, contents, username}}} = this.props
        return (
            <Panel
                className={styles.panel}
                placement='modal'
                onBackdropClick={this.implicitDismiss}>
                <Panel.Header
                    icon='envelope'
                    title={subject}
                    label={msg('message.from', {username})}
                />
                <Panel.Content>
                    <Markdown className={styles.contents} source={contents}/>
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Close
                            keybinding={['Enter', 'Escape']}
                            onClick={this.dismiss}
                        />
                    </Panel.Buttons.Main>
                    <Panel.Buttons.Extra>
                        {this.renderAcknowledged()}
                    </Panel.Buttons.Extra>
                </Panel.Buttons>
            </Panel>
        )
    }
}

ShowMessage.propTypes = {
    message: PropTypes.object.isRequired,
    onClose: PropTypes.func.isRequired,
    important: PropTypes.bool,
    isAdmin: PropTypes.bool
}

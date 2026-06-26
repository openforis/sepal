import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Label} from '~/widget/label'
import {Layout} from '~/widget/layout'
import {Markdown} from '~/widget/markdown'
import {Panel} from '~/widget/panel/panel'
import {Widget} from '~/widget/widget'

import styles from './userMessage.module.css'

const fields = {
    subject: new Form.Field()
        .notBlank('userMessage.form.subject.required'),
    contents: new Form.Field()
        .notBlank('userMessage.form.contents.required')
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
            username: user.username
        }
    }
}

class _EditUserMessage extends React.Component {
    renderPreview() {
        const {inputs: {contents}} = this.props
        return (
            <Widget
                label={msg('userMessage.form.preview.label')}
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
                            label={msg('userMessage.form.subject.label')}
                            autoFocus
                            input={subject}
                            spellCheck={false}
                        />
                        <Form.Input
                            label={msg('userMessage.form.contents.label')}
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
                isActionForm={true}
                statePath='userMessage'
                onApply={message => onApply(message)}
                onCancel={onCancel}>
                <Panel.Header
                    icon='bell'
                    title={msg('userMessage.title')}/>
                {this.renderPanel()}
            </Form.Panel>
        )
    }
}

export const EditUserMessage = compose(
    _EditUserMessage,
    withForm({fields, mapStateToProps})
)

EditUserMessage.propTypes = {
    message: PropTypes.object.isRequired,
    onApply: PropTypes.func,
    onCancel: PropTypes.func.isRequired
}

export class ShowUserMessage extends React.Component {
    render() {
        const {message: {message: {subject, contents}, username}, onCancel} = this.props
        return (
            <Panel
                className={styles.panel}
                placement='modal'
                onBackdropClick={onCancel}>
                <Panel.Header
                    icon='envelope'
                    title={subject}
                    label={username}
                />
                <Panel.Content>
                    <Markdown className={styles.contents} source={contents}/>
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Close
                            keybinding={['Enter', 'Escape']}
                            onClick={onCancel}
                        />
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }
}

ShowUserMessage.propTypes = {
    message: PropTypes.object.isRequired,
    onCancel: PropTypes.func.isRequired
}

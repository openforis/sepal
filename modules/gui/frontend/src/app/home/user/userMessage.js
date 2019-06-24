import {Form, form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {PanelContent, PanelHeader} from 'widget/panel'
import {compose} from 'compose'
import {msg} from 'translate'
import Label from 'widget/label'
import Markdown from 'react-markdown'
import PropTypes from 'prop-types'
import React from 'react'
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

class UserMessage extends React.Component {
    renderPreview() {
        const {inputs: {contents}} = this.props
        return (
            <div>
                <Label msg={'Preview'}/>
                <Markdown className={styles.contents} source={contents.value}/>
            </div>
        )
    }

    renderPanel() {
        const {inputs: {subject, contents}} = this.props
        return (
            <React.Fragment>
                <PanelContent>
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
                </PanelContent>
                <Form.PanelButtons/>
            </React.Fragment>
        )
    }

    render() {
        const {form, onApply, onCancel} = this.props
        return (
            <Form.Panel
                className={styles.panel}
                form={form}
                isActionForm={true}
                statePath='userMessage'
                modal
                onApply={message => onApply(message)}
                close={() => onCancel()}>
                <PanelHeader
                    icon='bell'
                    title={msg('userMessage.title')}/>
                {this.renderPanel()}
            </Form.Panel>
        )
    }
}

UserMessage.propTypes = {
    message: PropTypes.object.isRequired,
    onApply: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired
}

export default compose(
    UserMessage,
    form({fields, mapStateToProps})
)

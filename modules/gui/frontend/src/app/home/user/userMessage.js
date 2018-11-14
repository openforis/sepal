import {Field, Input, form} from 'widget/form'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import {msg} from 'translate'
import {v4 as uuid} from 'uuid'
import Markdown from 'react-markdown'
import PanelButtons from 'widget/panelButtons'
import Portal from 'widget/portal'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './userMessage.module.css'

const fields = {
    subject: new Field()
        .notBlank('user.userMessage.form.subject.required'),
    contents: new Field()
        .notBlank('user.userMessage.form.contents.required')
}
const mapStateToProps = (state, ownProps) => {
    const user = state.user.currentUser
    const message = ownProps.message
    return {
        user,
        values: {
            id: (message && message.id) || uuid(),
            type: 'SYSTEM',
            subject: (message && message.subject) || '',
            contents: (message && message.contents) || '',
            username: user.username
        }
    }
}

const markdownInstructions =
`
Markdown syntax cheatsheet

# Title
## Subtitle
### Sub-subtitle

- unordered list, item one
- unordered list, item two
- unordered list, item three

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Fusce tincidunt a lectus at lobortis. Cras facilisis non lorem non bibendum. Aliquam egestas massa at nisl bibendum, vehicula consequat massa tempor.

1. ordered list, item one
2. ordered list, item two
3. ordered list, item three

[link to SEPAL](http://sepal.io)
`

class UserMessage extends React.Component {
    renderPanel() {
        const {onApply, onCancel, form, inputs: {subject, contents}} = this.props
        return (
            <React.Fragment>
                <PanelContent className={styles.panelContent}>
                    {/* <form> */}
                    <Input
                        label={msg('user.userMessage.form.subject.label')}
                        autoFocus
                        input={subject}
                        spellCheck={false}
                    />
                    <div className={styles.editorAndContents}>
                        <Input
                            label={msg('user.userMessage.form.contents.label')}
                            // tooltip={msg('user.userMessage.form.subject.tooltip')}
                            input={contents}
                            placeholder={markdownInstructions}
                            textArea={true}
                            spellCheck={false}
                        />
                        <Markdown className={styles.contents} source={contents.value || markdownInstructions}/>
                    </div>
                    {/* </form> */}
                </PanelContent>
                <PanelButtons
                    form={form}
                    isActionForm={true}
                    statePath='userMessage'
                    onApply={message => onApply(message)}
                    onCancel={() => onCancel()}
                />
            </React.Fragment>
        )
    }

    render() {
        return (
            <Portal>
                <Panel className={styles.panel} center modal>
                    <PanelHeader
                        icon='user'
                        title={msg('user.userMessage.title')}/>
                    {this.renderPanel()}
                </Panel>
            </Portal>
        )
    }
}

UserMessage.propTypes = {
    message: PropTypes.object.isRequired,
    onApply: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired
}

export default form({fields, mapStateToProps})(UserMessage)

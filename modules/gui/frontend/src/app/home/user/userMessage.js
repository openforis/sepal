import PropTypes from 'prop-types'
import React from 'react'
import Markdown from 'react-markdown'
import {msg} from 'translate'
import {v4 as uuid} from 'uuid'
import {Field, form, Input, Label} from 'widget/form'
import Panel, {PanelContent, PanelHeader} from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import Portal from 'widget/portal'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import styles from './userMessage.module.css'

const fields = {
    subject: new Field()
        .notBlank('userMessage.form.subject.required'),
    contents: new Field()
        .notBlank('userMessage.form.contents.required')
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

// const markdownInstructions =
//     `
// Markdown syntax cheatsheet
//
// # Title
// ## Subtitle
// ### Sub-subtitle
//
// - unordered list, item one
// - unordered list, item two
// - unordered list, item three
//
// Lorem ipsum dolor sit amet, consectetur adipiscing elit. Fusce tincidunt a lectus at lobortis. Cras facilisis non lorem non bibendum. Aliquam egestas massa at nisl bibendum, vehicula consequat massa tempor.
//
// 1. ordered list, item one
// 2. ordered list, item two
// 3. ordered list, item three
//
// [link to SEPAL](http://sepal.io)
// `

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
                    <ScrollableContainer>
                        <Scrollable className={styles.panelContent}>
                            <Input
                                label={msg('userMessage.form.subject.label')}
                                autoFocus
                                input={subject}
                                spellCheck={false}
                            />
                            <Input
                                label={msg('userMessage.form.contents.label')}
                                input={contents}
                                textArea={true}
                                spellCheck={false}
                            />
                            {contents.value ? this.renderPreview() : null}
                        </Scrollable>
                    </ScrollableContainer>
                </PanelContent>
                <PanelButtons/>
            </React.Fragment>
        )
    }

    render() {
        const {form, onApply, onCancel} = this.props
        return (
            <Portal>
                <Panel
                    className={styles.panel}
                    form={form}
                    isActionForm={true}
                    statePath='userMessage'
                    center
                    modal
                    onApply={message => onApply(message)}
                    onCancel={() => onCancel()}>
                    <PanelHeader
                        icon='bell'
                        title={msg('userMessage.title')}/>
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

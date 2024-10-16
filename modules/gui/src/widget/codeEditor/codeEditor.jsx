import {autocompletion, completionKeymap, completionStatus} from '@codemirror/autocomplete'
import {javascript} from '@codemirror/lang-javascript'
import {linter} from '@codemirror/lint'
import {EditorState} from '@codemirror/state'
import {EditorView, keymap} from '@codemirror/view'
import PropTypes from 'prop-types'
import React from 'react'
import {boysAndGirls as theme} from 'thememirror'

import {Keybinding} from '../keybinding'

export class CodeEditor extends React.Component {
    state = {show: false, completing: false}

    constructor(props) {
        super(props)
        this.onKeyPress = this.onKeyPress.bind(this)
        this.setupEditor = this.setupEditor.bind(this)
    }

    render() {
        const {show} = this.state
        // [HACK] Defer rendering one cycle, to ensure keybindings have priority
        return show
            ? (
                <Keybinding keymap={{
                    Enter: this.onKeyPress,
                    Escape: this.onKeyPress
                }}>
                    <div ref={this.setupEditor}/>
                </Keybinding>
            )
            : null
    }

    componentDidMount() {
        this.setState({show: true})
    }

    componentWillUnmount() {
        this.view.destroy()
    }

    onKeyPress() {
        const {completing} = this.state
        // Disable all keybinding when we're completing
        // If we're not completing, hand keybinding over to another component
        return completing ? null : false
    }

    setupEditor(editorElement) {
        const {autoComplete, lint, input} = this.props

        const updateListener = EditorView.updateListener.of(
            update => {
                const {onChange} = this.props
                // [HACK] Give time for key handlers to react on previous completing state
                // before updating it
                setImmediate(() =>
                    this.setState(({completing: prevCompleting}) => {
                        const completing = !!completionStatus(this.view.state)
                        return completing === prevCompleting ? null : {completing}
                    })
                )
                const value = update.state.doc.text.join('\n')
                if (input.value !== value) {
                    input.set(value)
                    onChange && onChange(value)
                }
            }
        )

        const state = EditorState.create({
            doc: input.value,
            extensions: [
                keymap.of(completionKeymap),
                theme,
                javascript(),
                autocompletion({
                    override: [autoComplete]
                }),
                linter(lint),
                updateListener,
            ]
        })
        
        this.view = new EditorView({
            parent: editorElement,
            state: state
        })
    }
}

CodeEditor.propTypes = {
    autoComplete: PropTypes.func.isRequired,
    input: PropTypes.object.isRequired,
    lint: PropTypes.func.isRequired,
    onChange: PropTypes.func
}

import {autocompletion, completionKeymap, completionStatus} from '@codemirror/autocomplete'
import {defaultKeymap, history, historyKeymap} from '@codemirror/commands'
// import {history, historyKeymap} from '@codemirror/history'
import {javascript} from '@codemirror/lang-javascript'
import {forEachDiagnostic, linter, lintKeymap} from '@codemirror/lint'
import {EditorState} from '@codemirror/state'
import {EditorView, keymap} from '@codemirror/view'
import PropTypes from 'prop-types'
import React from 'react'

import {Keybinding} from '../keybinding'
import _styles from './codeEditor.module.css'
// import {boysAndGirls as theme} from 'thememirror'
import {theme} from './theme'

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
        const {autoComplete, lint, input, autoFocus} = this.props

        const updateListener = EditorView.updateListener.of(
            update => {
                const {onExpressionChange} = this.props
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
                    onExpressionChange && onExpressionChange(value)
                }
                let messages = []
                forEachDiagnostic(this.view.state, diagnostic => messages.push(diagnostic.message))
                input.setInvalid(messages.length ? messages[0] : '')
            }
        )

        const state = EditorState.create({
            doc: input.value,
            extensions: [
                keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap, ...lintKeymap]),
                history({minDepth: 100, newGroupDelay: 500}),
                theme(),
                javascript(),
                autocompletion({
                    override: [autoComplete],
                }),
                linter(lint, {delay: 0}),
                updateListener,
            ]
        })
        
        this.view = new EditorView({
            parent: editorElement,
            state: state
        })

        if (autoFocus) {
            this.view.focus()
        }
          
    }
}

CodeEditor.propTypes = {
    autoComplete: PropTypes.func.isRequired,
    input: PropTypes.object.isRequired,
    lint: PropTypes.func.isRequired,
    autoFocus: PropTypes.any,
    onExpressionChange: PropTypes.func
}

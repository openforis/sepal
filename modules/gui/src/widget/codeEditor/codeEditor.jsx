import {autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, completionStatus} from '@codemirror/autocomplete'
import {defaultKeymap, history, historyKeymap} from '@codemirror/commands'
import {javascript} from '@codemirror/lang-javascript'
import {forEachDiagnostic, linter, lintKeymap} from '@codemirror/lint'
import {EditorState} from '@codemirror/state'
import {EditorView, keymap} from '@codemirror/view'
import PropTypes from 'prop-types'
import React from 'react'

import {msg} from '~/translate'

import {Icon} from '../icon'
import {Keybinding} from '../keybinding'
import {Layout} from '../layout'
import styles from './codeEditor.module.css'
import {theme} from './theme'

export class CodeEditor extends React.Component {
    state = {show: false, completing: false}

    constructor(props) {
        super(props)
        this.onKeyPress = this.onKeyPress.bind(this)
        this.setupEditor = this.setupEditor.bind(this)
    }

    render() {
        const {example} = this.props
        const {show} = this.state
        const tooltip = (
            <Layout spacing='compact'>
                <div>{msg('widget.codeEditor.help1')}</div>
                <div>{msg('widget.codeEditor.help2')}</div>
                {example ? <div>{msg('widget.codeEditor.example', {example})}</div> : ''}
            </Layout>
        )
        // [HACK] Defer rendering one cycle, to ensure keybindings have priority
        return show
            ? (
                <Keybinding keymap={{
                    Enter: this.onKeyPress,
                    Escape: this.onKeyPress
                }}>
                    <div>
                        <div ref={this.setupEditor}/>
                        <Layout
                            type='horizontal'
                            alignment='right'
                            spacing='compact'
                            className={styles.info}>
                            <div>{msg('widget.codeEditor.info')}</div>
                            <Icon
                                name='circle-question'
                                tooltip={tooltip}
                                tooltipDelay={0}
                            />
                        </Layout>
                    </div>
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
        
        const enterDisabled = keymap.of([{key: 'Enter', run: () => true}])
        const state = EditorState.create({
            doc: input.value,
            extensions: [
                enterDisabled,
                keymap.of([
                    ...defaultKeymap,
                    ...historyKeymap,
                    ...closeBracketsKeymap,
                    ...completionKeymap,
                    ...lintKeymap,
                ]),
                history(),
                EditorView.lineWrapping,
                closeBrackets(),
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
    example: PropTypes.string,
    onExpressionChange: PropTypes.func
}

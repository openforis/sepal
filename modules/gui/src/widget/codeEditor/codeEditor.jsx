import {autocompletion, completionKeymap} from '@codemirror/autocomplete'
import {javascript} from '@codemirror/lang-javascript'
import {EditorState} from '@codemirror/state'
import {EditorView, keymap} from '@codemirror/view'
import PropTypes from 'prop-types'
import React from 'react'
import {boysAndGirls as theme} from 'thememirror'

export class CodeEditor extends React.Component {
    editorRef = React.createRef()

    render() {
        return (
            <div ref={this.editorRef}/>
        )
    }

    componentDidMount() {
        const {autoComplete, input} = this.props

        const state = EditorState.create({
            doc: input.value,
            extensions: [
                keymap.of(completionKeymap),
                theme,
                javascript(),
                autocompletion({
                    override: [autoComplete]
                })
            ]
        })
        
        this.view = new EditorView({
            parent: this.editorRef.current,
            state: state
        })
    }

    componentWillUnmount() {
        this.view.destroy()
    }
}

CodeEditor.propTypes = {
    autoComplete: PropTypes.func.isRequired,
    input: PropTypes.object.isRequired
}

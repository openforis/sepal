import {HighlightStyle, syntaxHighlighting} from '@codemirror/language'
import {EditorView} from '@codemirror/view'
import {tags as t} from '@lezer/highlight'

export const theme = () => {
    // https://github.com/vadimdemedes/thememirror/blob/main/source/themes/dracula.ts
    const settings = {
        // background: '#2d2f3f',
        background: 'hsla(0, 0%, 0%, .9)',
        foreground: '#f8f8f2',
        caret: '#f8f8f0',
        selection: '#44475a',
        gutterBackground: '#282a36',
        gutterForeground: 'rgb(144, 145, 148)',
        lineHighlight: '#44475a',
        dark: true
    }
    const styles = [
        {
            tag: t.comment,
            color: '#6272a4',
        },
        {
            tag: [t.number, t.self, t.bool, t.null],
            color: '#bd93f9',
        },
        {
            tag: [t.keyword, t.operator],
            color: '#ff79c6',
        },
        {
            tag: [t.definitionKeyword, t.typeName],
            color: '#8be9fd',
        },
        {
            tag: t.definition(t.typeName),
            color: '#f8f8f2',
        },
        {
            tag: [
                t.className,
                t.definition(t.propertyName),
                t.function(t.variableName),
                t.attributeName,
            ],
            color: '#50fa7b',
        },
        {
            tag: [t.variableName, t.attributeName, t.self],
            color: '#E62286',
            fontWeight: 'bold',
        },
    ]
    const codeMirrorTheme = EditorView.theme(
        {

            // '&': {color: '#ECEFF4', backgroundColor: '#2E3440', fontSize: '18px'},
            // '.cm-content': {minHeight: '638px'},
            // '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {backgroundColor: '#4C566A'},
            // '.cm-selectionMatch .cm-snippetField': {backgroundColor: '#A3BE8C'},
            // '&.cm-focused .cm-cursor': {borderLeftColor: '#D08770'},
            // '.cm-gutters': {backgroundColor: '#2E3440', border: 'none', color: '#4C566A'},
            // '.cm-activeLineGutter': {backgroundColor: '#2E3440', color: '#ECEFF4'},
            // '.cm-activeLine': {backgroundColor: '#3B4252'},
            // '.cm-foldPlaceholder': {backgroundColor: 'transparent', border: 'none', color: '#D08770'},
            // '.cm-tooltip': {border: 'none', backgroundColor: '#4C566A'},
            // '.cm-tooltip .cm-tooltip-arrow:before': {borderTopColor: 'transparent', borderBottomColor: 'transparent'},
            // '.cm-tooltip .cm-tooltip-arrow:after': {borderTopColor: '#B48EAD', borderBottomColor: '#B48EAD'},
            // '.cm-tooltip-autocomplete': {'& > ul > li[aria-selected]': {backgroundColor: '#4C566A', color: '#A3BE8C'}}
                        
            '&': {
                backgroundColor: settings.background,
                color: settings.foreground,
            },
            '.cm-content': {
                caretColor: settings.caret,
            },
            '.cm-cursor, .cm-dropCursor': {
                borderLeftColor: settings.caret,
            },
            '&.cm-focused .cm-selectionBackgroundm .cm-selectionBackground, .cm-content ::selection':
            	{
            	    backgroundColor: settings.selection,
            	},
            '.cm-activeLine': {
                backgroundColor: settings.lineHighlight,
            },
            '.cm-gutters': {
                backgroundColor: settings.gutterBackground,
                color: settings.gutterForeground,
            },
            '.cm-activeLineGutter': {
                backgroundColor: settings.lineHighlight,
            },
            // '.cm-tooltip-autocomplete': {
            //     color: 'green',
            //     '& > ul': {
            //         '& > li': {
            //             backgroundColor: 'hsla(0, 0%, 0%, 0.9)',
            //             fontFamily: 'Ubuntu, Helvetica Neue, Helvetica, Arial, sans-serif',
            //             fontSize: '.9rem',
            //             lineHeight: '.9rem',
            //             letterSpacing: '0',
            //             fontWeight: '400',
            //             padding: '7.56px 12.096px !important'
            //         },
            //         '& > completion-section': {
            //             backgroundColor: '#181818',
            //             color: 'white',
            //             opacity: '1 !important',
            //         },
            //         '& > li[aria-selected]': {
            //             backgroundColor: 'hsla(40, 60%, 20%, 1)',
            //             color: 'hsla(0, 0%, 100%, 1',
            //             // borderColor: 'hsla(40, 60%, 22%, 1)',
            //         }
            //     },
            // },
        },
        {
            dark: settings.dark
        },
    )

    const highlightStyle = HighlightStyle.define(styles)
    const extension = [codeMirrorTheme, syntaxHighlighting(highlightStyle)]

    return extension
}

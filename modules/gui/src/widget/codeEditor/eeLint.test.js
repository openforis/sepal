import {javascript} from '@codemirror/lang-javascript'
import {EditorState} from '@codemirror/state'

import {eeLint} from './eeLint'

// it('missing variable gives error', () => {
//     expect(lint({
//         images: [],
//         expression: 'a'
//     })).toMatchObject([{
//         from: 0,
//         to: 1,
//         severity: 'error',
//         message: 'widget.codeEditor.eeAutoLint.undefinedVariable'
//     }])
// })

// it('image name gives no problems', () => {
//     const image = {name: 'i1', includedBands: [{name: 'b1'}]}
//     expect(lint({
//         images: [image],
//         expression: 'i1'
//     })).toMatchObject([])
// })

// it('math constant gives no problems', () => {
//     expect(lint({
//         images: [],
//         expression: 'PI'
//     })).toMatchObject([])
// })

// it('math function taking one argument is provided with one argument gives no problems', () => {
//     expect(lint({
//         images: [],
//         expression: 'abs(1)'
//     })).toMatchObject([])
// })

// it('math function taking two argument is provided with one argument gives no problems', () => {
//     const image = {name: 'i1', includedBands: [{name: 'b1'}]}
//     expect(lint({
//         images: [image],
//         expression: 'max(1, i1)'
//     })).toMatchObject([])
// })

// it('math function taking one argument is provided with two argument gives error', () => {
//     expect(lint({
//         images: [],
//         expression: 'abs(1, 2)'
//     })).toMatchObject([{
//         from: 3,
//         to: 9,
//         severity: 'error',
//         message: 'widget.codeEditor.eeAutoLint.invalidArgCount'
//     }])
// })

// it('math function taking one argument is provided without arguments gives error', () => {
//     expect(lint({
//         images: [],
//         expression: 'abs()'
//     })).toMatchObject([{
//         from: 3,
//         to: 5,
//         severity: 'error',
//         message: 'widget.codeEditor.eeAutoLint.invalidArgCount'
//     }])
// })

it('math function without arguments gives error', () => {
    expect(lint({
        images: [],
        expression: 'abs'
    })).toMatchObject([{
        from: 0,
        to: 3,
        severity: 'error',
        message: 'widget.codeEditor.eeAutoLint.undefinedVariable'
    }])
})

// Function without any ArgList at all

const lint = ({images, expression}) => {
    const state = EditorState.create({
        doc: expression,
        extensions: javascript()
    })
    return eeLint(images, msg)({state})
}

const msg = (key, args) => key

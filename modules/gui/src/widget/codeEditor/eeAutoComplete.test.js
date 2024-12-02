import {CompletionContext} from '@codemirror/autocomplete'
import {javascript} from '@codemirror/lang-javascript'
import {EditorState} from '@codemirror/state'

import {eeAutoComplete} from './eeAutoComplete'
import {mathOptions} from './mathOptions'

it('an empty expression autoCompletes math functions and constants', () => {
    expect(autoComplete({
        images: [],
        expression: '',
        pos: 0
    })).toMatchObject({
        from: 0,
        to: 0,
        options: mathOptions(msg)
    })
})

it('suggest everything when on first position with a variable in the expression', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(autoComplete({
        images: [image],
        expression: 'i1',
        pos: 0
    })).toMatchObject({
        from: 0,
        to: 2,
        options: [imageNameOption(image), ...mathOptions(msg)]
    })
})

it('an empty expression autoCompletes image names', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(autoComplete({
        images: [image],
        expression: '',
        pos: 0
    })).toMatchObject({
        from: 0,
        to: 0,
        options: [imageNameOption(image), ...mathOptions(msg)]
    })
})

it('when at the beginning of an imageName, it is replaced', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(autoComplete({
        images: [image],
        expression: 'c2',
        pos: 0
    })).toMatchObject({
        from: 0,
        to: 2,
        options: [imageNameOption(image), ...mathOptions(msg)]
    })
})

it('when at the middle of an imageName, it is replaced', () => {
    const image = {name: 'a1', includedBands: [{name: 'b1'}]}
    expect(autoComplete({
        images: [image],
        expression: 'i1 + a2',
        pos: 6
    })).toMatchObject({
        from: 5,
        to: 7,
        options: [imageNameOption(image), ...filteredMathOptions('a')]
    })
})

it('when at the middle of an imageName, prefix must match', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(autoComplete({
        images: [image],
        expression: 'c1',
        pos: 1
    })).toMatchObject({
        options: filteredMathOptions('c')
    })
})

it('when at the end of an imageName, it is replaced', () => {
    const image = {name: 'i12', includedBands: [{name: 'b1'}]}
    expect(autoComplete({
        images: [image],
        expression: 'c1 + i1',
        pos: 7
    })).toMatchObject({
        from: 5,
        to: 7,
        options: [imageNameOption(image), ...filteredMathOptions('i1')]
    })
})

it('when expecting a binary operator, nothing is suggested', () => {
    const image = {name: 'c1', includedBands: [{name: 'b1'}]}
    expect(autoComplete({
        images: [image],
        expression: 'c1 ',
        pos: 3
    })).toMatchObject({
        options: []
    })
})

it('when opened paranthesis, images are suggested', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(autoComplete({
        images: [image],
        expression: '(',
        pos: 1
    })).toMatchObject({
        from: 1,
        to: 1,
        options: [imageNameOption(image), ...mathOptions(msg)]
    })
})

it('auto-completes band name using . when there is no band specified already', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(autoComplete({
        images: [image],
        expression: 'i1.',
        pos: 3
    })).toMatchObject({
        from: 3,
        to: 3,
        options: [bandNameOption('b1')]
    })
})

it('replaces band name when . is used', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(autoComplete({
        images: [image],
        expression: 'i1.c',
        pos: 3
    })).toMatchObject({
        from: 3,
        to: 4,
        options: [bandNameOption('b1')]
    })
})

it('auto-completes band name using . when there is a band specified', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(autoComplete({
        images: [image],
        expression: 'i1.b',
        pos: 4
    })).toMatchObject({
        from: 3,
        to: 4,
        options: [bandNameOption('b1')]
    })
})

it('auto-completes band name using aray syntax', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(autoComplete({
        images: [image],
        expression: 'i1[',
        pos: 3
    })).toMatchObject({
        from: 3,
        to: 3,
        options: [bandNameStringOption('b1')]
    })
})

it('auto-completes band name using aray syntax', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(autoComplete({
        images: [image],
        expression: 'i1["',
        pos: 4
    })).toMatchObject({
        from: 3,
        to: 4,
        options: [bandNameStringOption('b1')]
    })
})

it('replaces band name using aray syntax', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(autoComplete({
        images: [image],
        expression: 'i1["b',
        pos: 3
    })).toMatchObject({
        from: 3,
        to: 5,
        options: [bandNameStringOption('b1')]
    })
})

it('image name takes precedence when the same name as math function', () => {
    const image = {name: 'abs', includedBands: [{name: 'b1'}]}
    expect(autoComplete({
        images: [image],
        expression: 'abs',
        pos: 3
    })).toMatchObject({
        from: 0,
        to: 3,
        options: [imageNameOption(image)]
    })
})

it('No suggestions after variable', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(autoComplete({
        images: [image],
        expression: 'i1 ',
        pos: 3
    })).toMatchObject({
        options: []
    })
})

it('Suggest after binary operator without space', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(autoComplete({
        images: [image],
        expression: '1+',
        pos: 2
    })).toMatchObject({
        options: [imageNameOption(image), ...mathOptions(msg)]
    })
})

it('Suggest after binary operator with space', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(autoComplete({
        images: [image],
        expression: '1 + ',
        pos: 4
    })).toMatchObject({
        options: [imageNameOption(image), ...mathOptions(msg)]
    })
})

it('Suggest first function argument', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(autoComplete({
        images: [image],
        expression: 'abs(',
        pos: 4
    })).toMatchObject({
        options: [imageNameOption(image), ...mathOptions(msg)]
    })
})

it('Suggest second function argument without space', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(autoComplete({
        images: [image],
        expression: 'max(1,',
        pos: 6
    })).toMatchObject({
        options: [imageNameOption(image), ...mathOptions(msg)]
    })
})

it('Suggest second function argument with space', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(autoComplete({
        images: [image],
        expression: 'max(1, ',
        pos: 7
    })).toMatchObject({
        options: [imageNameOption(image), ...mathOptions(msg)]
    })
})

it('Suggest after bang', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(autoComplete({
        images: [image],
        expression: '!',
        pos: 1
    })).toMatchObject({
        options: [imageNameOption(image), ...mathOptions(msg)]
    })
})

it('Suggest after comparison', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(autoComplete({
        images: [image],
        expression: '4>',
        pos: 2
    })).toMatchObject({
        options: [imageNameOption(image), ...mathOptions(msg)]
    })
})

it('Suggest after in conditional', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(autoComplete({
        images: [image],
        expression: '1?',
        pos: 2
    })).toMatchObject({
        options: [imageNameOption(image), ...mathOptions(msg)]
    })
})

it('Suggest after in conditional else', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(autoComplete({
        images: [image],
        expression: '1?1:',
        pos: 4
    })).toMatchObject({
        options: [imageNameOption(image), ...mathOptions(msg)]
    })
})

const autoComplete = ({images, expression, pos}) => {
    const state = EditorState.create({
        doc: expression,
        extensions: javascript()
    })
    const context = new CompletionContext(state, pos, false)
    return eeAutoComplete(images, msg)(context)
}

const filteredMathOptions = (prefix = '') =>
    mathOptions(msg)
        .filter(({label}) => label.startsWith(prefix))

const imageNameOption = image => ({
    label: image.name,
    type: 'variable'
})

const bandNameOption = bandName => ({
    label: bandName,
    type: 'property'
})

const bandNameStringOption = bandName => ({
    label: `'${bandName}'`,
    displayLabel: bandName,
    type: 'property'
})

const msg = key => key

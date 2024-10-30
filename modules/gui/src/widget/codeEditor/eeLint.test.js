import {javascript} from '@codemirror/lang-javascript'
import {EditorState} from '@codemirror/state'

import {eeLint} from './eeLint'

it('missing variable gives error', () => {
    expect(lint({
        images: [],
        expression: 'a'
    })).toMatchObject([{
        from: 0,
        to: 1,
        severity: 'error',
        message: msg('widget.codeEditor.eeLint.undefinedVariable', {variableName: 'a'})
    }])
})

it('image name gives no problems', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(lint({
        images: [image],
        expression: 'i1'
    })).toMatchObject([])
})

it('invalid band name using . gives error', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(lint({
        images: [image],
        expression: 'i1.b2'
    })).toMatchObject([{
        from: 3,
        to: 5,
        severity: 'error',
        message: msg('widget.codeEditor.eeLint.invalidBand', {imageName: 'i1', bandName: 'b2'})
    }])
})

it('valid band name using . gives no problems', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(lint({
        images: [image],
        expression: 'i1.b1'
    })).toMatchObject([])
})

it('invalid band name using [] gives error', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(lint({
        images: [image],
        expression: 'i1["b2"]'
    })).toMatchObject([{
        from: 3,
        to: 7,
        severity: 'error',
        message: msg('widget.codeEditor.eeLint.invalidBand', {imageName: 'i1', bandName: 'b2'})
    }])
})

it('valid band name using [] gives no problem', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(lint({
        images: [image],
        expression: 'i1["b1"]'
    })).toMatchObject([])
})

it('using . gives no problem', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(lint({
        images: [image],
        expression: 'i1["b1"]'
    })).toMatchObject([])
})

it('using . after a parenthesis gives error', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(lint({
        images: [image],
        expression: '(i1).b1'
    })).toMatchObject([{
        from: 4,
        to: 5,
        severity: 'error',
        message: msg('widget.codeEditor.eeLint.syntaxError')
    }])
})

it('using [ after a parenthesis gives error', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(lint({
        images: [image],
        expression: '(i1)["b1"]'
    })).toMatchObject([{
        from: 4,
        to: 5,
        severity: 'error',
        message: msg('widget.codeEditor.eeLint.syntaxError')
    }])
})

it('when both syntax error and a logical error in same range, only the logical error is returned', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(lint({
        images: [image],
        expression: '(i1).'
    })).toMatchObject([{
        severity: 'error',
        message: msg('widget.codeEditor.eeLint.syntaxError')
    }])
})

it('math constant gives no problems', () => {
    expect(lint({
        images: [],
        expression: 'PI'
    })).toMatchObject([])
})

it('math function taking one argument is provided with one argument gives no problems', () => {
    expect(lint({
        images: [],
        expression: 'abs(1)'
    })).toMatchObject([])
})

it('math function taking two argument is provided with one argument gives no problems', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(lint({
        images: [image],
        expression: 'max(1, i1)'
    })).toMatchObject([])
})

it('math function taking one argument is provided with two argument gives error', () => {
    expect(lint({
        images: [],
        expression: 'abs(1, 2)'
    })).toMatchObject([{
        from: 3,
        to: 9,
        severity: 'error',
        message: msg('widget.codeEditor.eeLint.invalidArgCount', {argCount: 2, expectedArgCount: 1})
    }])
})

it('math function taking one argument is provided without arguments gives error', () => {
    expect(lint({
        images: [],
        expression: 'abs()'
    })).toMatchObject([{
        from: 3,
        to: 5,
        severity: 'error',
        message: msg('widget.codeEditor.eeLint.invalidArgCount', {argCount: 0, expectedArgCount: 1})
    }])
})

it('math function as variable gives error', () => {
    expect(lint({
        images: [],
        expression: 'abs'
    })).toMatchObject([{
        from: 0,
        to: 3,
        severity: 'error',
        message: msg('widget.codeEditor.eeLint.undefinedVariable', {variableName: 'abs'})
    }])
})

it('malformed expression gives error', () => {
    expect(lint({
        images: [],
        expression: '-'
    })).toMatchObject([{
        from: 1,
        to: 1,
        severity: 'error',
        message: msg('widget.codeEditor.eeLint.syntaxError')
    }])
})

it('The >>> operator gives error', () => {
    expect(lint({
        images: [],
        expression: '5 >>> 1'
    })).toMatchObject([{
        severity: 'error',
        message: msg('widget.codeEditor.eeLint.syntaxError')
    }])
})

it('The ~ operator gives error', () => {
    expect(lint({
        images: [],
        expression: '~ 5'
    })).toMatchObject([{
        severity: 'error',
        message: msg('widget.codeEditor.eeLint.syntaxError')
    }])
})

it('The = operator gives error', () => {
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    expect(lint({
        images: [image],
        expression: 'i1 = 1'
    })).toMatchObject([{
        severity: 'error',
        message: msg('widget.codeEditor.eeLint.syntaxError')
    }])
})

it('The === operator gives error', () => {
    expect(lint({
        images: [],
        expression: '1 !== 5'
    })).toMatchObject([{
        severity: 'error',
        message: msg('widget.codeEditor.eeLint.syntaxError')
    }])
})

it('Malformed argument using nested parenthesis gives error', () => {
    expect(lint({
        images: [],
        expression: '((1)foo)'
    })).toMatchObject([{
        severity: 'error',
        message: msg('widget.codeEditor.eeLint.syntaxError')
    }])
})

it('The ** operator gives no problem', () => {
    expect(lint({
        images: [],
        expression: '2**3'
    })).toMatchObject([])
})

it('The && operator gives no problem', () => {
    expect(lint({
        images: [],
        expression: '2 && 3'
    })).toMatchObject([])
})

it('The || operator gives no problem', () => {
    expect(lint({
        images: [],
        expression: '2 || 3'
    })).toMatchObject([])
})

it('The | operator gives no problem', () => {
    expect(lint({
        images: [],
        expression: '2 | 3'
    })).toMatchObject([])
})

it('Images with 3 and 2 bands, gives error', () => {
    const image1 = {name: 'i1', includedBands: [{name: 'b1'}, {name: 'b2'}, {name: 'b3'}]}
    const image2 = {name: 'i2', includedBands: [{name: 'b1'}, {name: 'b2'}]}
    expect(lint({
        images: [image1, image2],
        expression: 'i1 + i2'
    })).toMatchObject([{
        from: 5,
        to: 7,
        severity: 'error',
        message: msg('widget.codeEditor.eeLint.invalidBandCount', {expectedBandCount: 3, bandCount: 2})
    }])
})

it('Images with 2 and 3 bands, gives error', () => {
    const image1 = {name: 'i1', includedBands: [{name: 'b1'}, {name: 'b2'}]}
    const image2 = {name: 'i2', includedBands: [{name: 'b1'}, {name: 'b2'}, {name: 'b3'}]}
    expect(lint({
        images: [image1, image2],
        expression: 'i1 + i2'
    })).toMatchObject([{
        from: 5,
        to: 7,
        severity: 'error',
        message: msg('widget.codeEditor.eeLint.invalidBandCount', {expectedBandCount: 2, bandCount: 3})
    }])
})

it('Images with 3 and 2 bands but using one of the bands, gives no problem', () => {
    const image1 = {name: 'i1', includedBands: [{name: 'b1'}, {name: 'b2'}, {name: 'b3'}]}
    const image2 = {name: 'i2', includedBands: [{name: 'b1'}, {name: 'b2'}]}
    expect(lint({
        images: [image1, image2],
        expression: 'i1 + i2.b1'
    })).toMatchObject([])
})

it('Images with 2 and 1 bands, gives no problem', () => {
    const image1 = {name: 'i1', includedBands: [{name: 'b1'}, {name: 'b2'}]}
    const image2 = {name: 'i2', includedBands: [{name: 'b1'}]}
    expect(lint({
        images: [image1, image2],
        expression: 'i1 + i2'
    })).toMatchObject([])
})

it('Images with 1 and 2 bands, gives no problem', () => {
    const image1 = {name: 'i1', includedBands: [{name: 'b1'}]}
    const image2 = {name: 'i2', includedBands: [{name: 'b1'}, {name: 'b2'}]}
    expect(lint({
        images: [image1, image2],
        expression: 'i1 + i2'
    })).toMatchObject([])
})

it('When only constants used returns constant band name', () => {
    let usedBandNames
    let includedBandNames
    lint({
        images: [],
        expression: '42',
        onBandChanged: ({usedBands, includedBands}) => {
            usedBandNames = usedBands.map(({name}) => name)
            includedBandNames = includedBands.map(({name}) => name)
        }
    })
    expect(includedBandNames).toEqual([
        'constant'
    ])
    expect(usedBandNames).toEqual([])
})

it('When a single band image is used, the band name is returned', () => {
    let usedBandNames
    let includedBandNames
    const image = {name: 'i1', includedBands: [{name: 'b1'}]}
    lint({
        images: [image],
        expression: 'i1',
        onBandChanged: ({usedBands, includedBands}) => {
            usedBandNames = usedBands.map(({name}) => name)
            includedBandNames = includedBands.map(({name}) => name)
        }
    })
    expect(includedBandNames).toEqual([
        'b1'
    ])
    expect(usedBandNames).toEqual([
        'b1'
    ])
})

it('When two different single band images are used, the first image band name is returned', () => {
    let usedBandNames
    let includedBandNames
    const image1 = {name: 'i1', includedBands: [{imageId: 'imageId1', id: 'id1', name: 'b1'}]}
    const image2 = {name: 'i2', includedBands: [{imageId: 'imageId2', id: 'id2', name: 'b2'}]}
    lint({
        images: [image1, image2],
        expression: 'i1 + i2',
        onBandChanged: ({usedBands, includedBands}) => {
            usedBandNames = usedBands.map(({name}) => name)
            includedBandNames = includedBands.map(({name}) => name)
        }
    })
    expect(includedBandNames).toEqual([
        'b1'
    ])
    expect(usedBandNames).toEqual([
        'b1', 'b2'
    ])
})

it('When a two band image is used, both band names are returned', () => {
    let usedBandNames
    let includedBandNames
    const image = {name: 'i1', includedBands: [
        {imageId: 'image-id1', id: 'id1', name: 'b1'},
        {imageId: 'image-id1', id: 'id2', name: 'b2'}]}
    lint({
        images: [image],
        expression: 'i1',
        onBandChanged: ({usedBands, includedBands}) => {
            usedBandNames = usedBands.map(({name}) => name)
            includedBandNames = includedBands.map(({name}) => name)
        }
    })
    expect(includedBandNames).toEqual([
        'b1', 'b2'
    ])
    expect(usedBandNames).toEqual([
        'b1', 'b2'
    ])
})

it('When single band from a multi-band image is used using . syntax, the single band is returned', () => {
    let usedBandNames
    let includedBandNames
    const image = {name: 'i1', includedBands: [{name: 'b1'}, {name: 'b2'}]}
    lint({
        images: [image],
        expression: 'i1.b1',
        onBandChanged: ({usedBands, includedBands}) => {
            usedBandNames = usedBands.map(({name}) => name)
            includedBandNames = includedBands.map(({name}) => name)
        }
    })
    expect(includedBandNames).toEqual([
        'b1'
    ])
    expect(usedBandNames).toEqual([
        'b1'
    ])
})

it('When single band from a multi-band image is used using [] syntax, the single band is returned', () => {
    let usedBandNames
    let includedBandNames
    const image = {name: 'i1', includedBands: [{name: 'b1'}, {name: 'b2'}]}
    lint({
        images: [image],
        expression: 'i1["b1"]',
        onBandChanged: ({usedBands, includedBands}) => {
            usedBandNames = usedBands.map(({name}) => name)
            includedBandNames = includedBands.map(({name}) => name)
        }
    })
    expect(includedBandNames).toEqual([
        'b1'
    ])
    expect(usedBandNames).toEqual([
        'b1'
    ])
})

const lint = ({images, expression, onBandChanged}) => {
    const state = EditorState.create({
        doc: expression,
        extensions: javascript()
    })
    return eeLint(images, msg, onBandChanged)({state})
}

const msg = (key, args) => ({key, args})

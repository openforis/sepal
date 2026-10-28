import fs from 'node:fs'
import path from 'node:path'

const TRANSLATIONS = path.join(import.meta.dirname, 'en', 'translations.json')
const SOURCE_ROOT = path.join(import.meta.dirname, '..')

describe('en translations', () => {
    it('defines every key referenced by a literal msg() call', () => {
        const defined = definedKeys()
        const missing = msgReferences()
            .filter(({key}) => !defined.has(key))
            .map(({file, line, key}) => `${file}:${line}  ${key}`)
        expect(missing).toEqual([])
    })

    it('defines each key only once', () => {
        expect(duplicateKeys()).toEqual([])
    })
})

// The file mixes nested objects with dotted leaf keys ("name.label" inside "form"),
// so both spellings have to flatten to the same dotted path msg() asks for.
const definedKeys = () => {
    const flatten = (node, prefix) =>
        Object.entries(node).flatMap(([key, value]) =>
            value !== null && typeof value === 'object'
                ? flatten(value, `${prefix}${key}.`)
                : [`${prefix}${key}`]
        )
    return new Set(flatten(JSON.parse(fs.readFileSync(TRANSLATIONS, 'utf8')), ''))
}

const MSG_KEY = /\bmsg\(\s*(['"])([A-Za-z0-9_.-]+)\1/g
const COMMENTED = /^\s*(\/\/|\/?\*)/

// Only literal single-argument calls are checkable; computed keys such as
// msg(`${x}.label`) are left alone rather than guessed at.
const msgReferences = () =>
    sourceFiles().flatMap(file =>
        fs.readFileSync(file, 'utf8').split('\n').flatMap((text, index) =>
            COMMENTED.test(text)
                ? []
                : [...text.matchAll(MSG_KEY)].map(([, , key]) => ({
                    file: path.relative(SOURCE_ROOT, file),
                    line: index + 1,
                    key
                }))
        )
    )

const sourceFiles = () =>
    fs.readdirSync(SOURCE_ROOT, {recursive: true, withFileTypes: true})
        .filter(entry => entry.isFile() && /\.jsx?$/.test(entry.name))
        .map(entry => path.join(entry.parentPath, entry.name))

// JSON.parse silently keeps the last of a repeated key, so a duplicate can only be
// caught in the raw text. Strings are consumed whole, keeping braces inside message
// values (such as "{count, plural, ...}") out of the nesting.
const duplicateKeys = () => {
    const token = /"((?:[^"\\]|\\.)*)"\s*(:)?|([{}])/g
    const source = fs.readFileSync(TRANSLATIONS, 'utf8')
    const duplicates = []
    const stack = []
    let pending = ''
    let match
    while ((match = token.exec(source)) !== null) {
        const [, string, colon, brace] = match
        if (brace === '{') {
            stack.push({prefix: stack.length ? `${stack.at(-1).prefix}${pending}.` : '', keys: new Set()})
        } else if (brace === '}') {
            stack.pop()
        } else if (colon) {
            const frame = stack.at(-1)
            if (frame.keys.has(string)) {
                duplicates.push(`${frame.prefix}${string}`)
            }
            frame.keys.add(string)
            pending = string
        }
    }
    return duplicates
}

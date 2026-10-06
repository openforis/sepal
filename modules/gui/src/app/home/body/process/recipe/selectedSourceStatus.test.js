import {describe, expect, it, vi} from 'vitest'

import {sectionStatusOf} from './selectedSourceStatus'
import {CHECKED, SUPPORTED, UNSUPPORTED} from './sourceRequirements'

// Whether a section's status advises of other sections' settings no longer suiting its source, over reads of one
// selection as the requirement reader makes them (sourceRequirements.js).

vi.mock('~/translate', () => ({msg: key => key}))

describe('a section whose source suits it, while another section\'s setting does not', () => {
    it('advises of that section where the requirement names it to', () => {
        const reads = [met(requirementIn('reference')), unmet(requirementIn('sources', {advise: ['reference']}))]

        expect(sectionStatusOf(STATE, reads, 'reference').advisories).toHaveLength(1)
    })

    it('says nothing of it where no requirement names the section to advise, though both read one source', () => {
        const reads = [met(requirementIn('reference')), unmet(requirementIn('sources')), unmet(requirementIn('dates', {advise: ['options']}))]

        expect(sectionStatusOf(STATE, reads, 'reference')).toBe(null)
    })
})

const STATE = {}
const SELECTED = {type: 'ASSET', id: 'users/x/segments'}

const requirementIn = (section, declaration = {}) => ({
    role: 'PRIMARY_IMAGE',
    section: {id: section, label: section},
    requirement: {capability: {label: 'segments'}, describe: () => ({message: `${section} does not suit`, details: []})},
    ...declaration
})

const met = declaration =>
    ({declaration, selected: SELECTED, selects: declaration.section.id === 'reference', acquisition: CHECKED, verdict: {status: SUPPORTED}})

const unmet = declaration =>
    ({...met(declaration), verdict: {status: UNSUPPORTED, diagnostic: {code: 'NOT_SUITED'}}})

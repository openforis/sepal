import {SUPPORTED} from '#sepal/recipe/requirement/verdict'

import {CALCULATION_REFERENCES, calculationItem} from '../chainRequirements'
import {updateIncludedBands} from '../panels/calculations/calculation'

// The bands each expression yields, derived again in calculation order, each from the inputs and the calculations before
// it as just derived. Only a calculation its requirements find met - its own reading of what it reads, and every
// calculation it depends on - is derived; one that is not keeps the bands it was derived with, and with them the names
// its outputs were given, until it is met again. A calculation whose bands are unchanged is returned as it was.
export const deriveCalculations = ({images, calculations}) =>
    calculations.reduce(
        ({derived, met}, calculation, index) => {
            const item = calculationItem({images, calculations: [...derived, ...calculations.slice(index)]}, index)
            const isMet = CALCULATION_REFERENCES.evaluate(item.facts).status === SUPPORTED
                && item.prerequisites.every(({item}) => met.includes(item))
            return {
                derived: [...derived, isMet && calculation.type === 'EXPRESSION' ? derive(calculation, item) : calculation],
                met: isMet ? [...met, calculation.imageId] : met
            }
        },
        {derived: [], met: []}
    ).derived

const derive = (calculation, {facts: {analysis}}) => {
    const includedBands = updateIncludedBands({...calculation, includedBands: analysis.includedBands})
    return isSame(includedBands, calculation.includedBands)
        ? calculation
        : {...calculation, includedBands}
}

// As the model holds them: a field left undefined is not held.
const isSame = (a, b) => JSON.stringify(a) === JSON.stringify(b)

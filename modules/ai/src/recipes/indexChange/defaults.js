// Default indexChange model. Mirrors the GUI's `defaultModel` from
// indexChangeRecipe.js. `fromImage` and `toImage` are intentionally absent —
// there's no sensible default; the LLM must populate them based on user
// intent (which two images to compare). The schema's `required` enforces this.
//
// The default legend is a generic three-bucket Decrease/Stable/Increase
// classification keyed off the sign of `difference`. It's a reasonable
// starting point for any continuous index; the LLM can rebuild it as needed.

const {randomUUID} = require('crypto')

const getDefaults = () => {
    const year = new Date().getUTCFullYear()
    return {
        dates: {
            fromDate: `${year}-01-01`,
            toDate: `${year + 1}-01-01`
        },
        legend: {
            entries: [
                {
                    id: randomUUID(),
                    color: '#d73027',
                    value: 1,
                    label: 'Decrease',
                    booleanOperator: 'and',
                    constraints: [{
                        id: randomUUID(),
                        description: 'difference < 0',
                        image: 'this-recipe',
                        band: 'difference',
                        operator: '<',
                        value: 0
                    }]
                },
                {
                    id: randomUUID(),
                    color: '#ffffff',
                    value: 2,
                    label: 'Stable',
                    booleanOperator: 'and',
                    constraints: [{
                        id: randomUUID(),
                        description: 'difference = 0',
                        image: 'this-recipe',
                        band: 'difference',
                        operator: '=',
                        value: 0
                    }]
                },
                {
                    id: randomUUID(),
                    color: '#1a9850',
                    value: 3,
                    label: 'Increase',
                    booleanOperator: 'and',
                    constraints: [{
                        id: randomUUID(),
                        description: 'difference > 0',
                        image: 'this-recipe',
                        band: 'difference',
                        operator: '>',
                        value: 0
                    }]
                }
            ]
        },
        options: {
            minConfidence: 2.5
        }
    }
}

module.exports = {getDefaults}

import PropTypes from 'prop-types'
import React from 'react'

import {msg} from '~/translate'
import {Form} from '~/widget/form'

// The compact Asset/Recipe choice in a source input's label row (`labelButtons`). Presentation only: the form owns the
// field, and what choosing a type clears, validates or loads. `recipe` is the value the form stores for a recipe.
export const SourceTypeButtons = ({input, recipe = 'RECIPE', onChange}) =>
    <Form.Buttons
        spacing='none'
        groupSpacing='none'
        size='x-small'
        shape='pill'
        input={input}
        options={[
            {value: 'ASSET', label: msg('process.sourceType.ASSET')},
            {value: recipe, label: msg('process.sourceType.RECIPE')}
        ]}
        onChange={onChange}
    />

SourceTypeButtons.propTypes = {
    input: PropTypes.object.isRequired,
    recipe: PropTypes.string,
    onChange: PropTypes.func
}

// The kind of a source and its picker, from one form value: the buttons choosing it, for the picker's label row, and
// whether the picker is a recipe's, given to `children({recipe, labelButtons})` to render that picker. A kind not yet
// chosen - a new input, or one whose model section does not exist - takes `defaultKind` as where the form starts, so
// opening is no edit; nothing is shown until it has. A saved kind is kept. What a kind's selection loads, validates,
// keeps or clears when the other is chosen is the caller's (`onChange`).
export class SourceKind extends React.Component {
    render() {
        const {input, recipe, onChange, children} = this.props
        return input.value
            ? children({
                recipe: input.value === recipe,
                labelButtons: [<SourceTypeButtons key='sourceKind' input={input} recipe={recipe} onChange={onChange}/>]
            })
            : null
    }

    componentDidMount() {
        this.initialize()
    }

    componentDidUpdate() {
        this.initialize()
    }

    initialize() {
        const {input, defaultKind} = this.props
        if (!input.value) {
            input.setInitialValue(defaultKind)
        }
    }
}

SourceKind.propTypes = {
    children: PropTypes.func.isRequired,
    defaultKind: PropTypes.string.isRequired,
    input: PropTypes.object.isRequired,
    recipe: PropTypes.string,
    onChange: PropTypes.func
}

SourceKind.defaultProps = {
    recipe: 'RECIPE'
}

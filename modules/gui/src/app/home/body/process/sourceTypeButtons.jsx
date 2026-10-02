import PropTypes from 'prop-types'

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

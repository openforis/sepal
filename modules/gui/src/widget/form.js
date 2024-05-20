import {FormAssetInput} from '~/widget/form/assetInput'
import {FormButtons} from '~/widget/form/buttons'
import {FormCheckbox} from '~/widget/form/checkbox'
import {FormCombo} from '~/widget/form/combo'
import {FormDatePicker} from '~/widget/form/datePicker'
import {FormFieldSet} from '~/widget/form/fieldset'
import {FormInput} from '~/widget/form/input'
import {FormPanel} from '~/widget/form/panel'
import {FormPanelButtons} from '~/widget/form/panelButtons'
import {FormConstraint, FormField} from '~/widget/form/property'
import {FormSlider} from '~/widget/form/slider'
import {FormYearPicker} from '~/widget/form/yearPicker'

import {FormAssetCombo} from './form/assetCombo'

export const Form = {
    AssetInput: FormAssetInput,
    AssetCombo: FormAssetCombo,
    Buttons: FormButtons,
    Checkbox: FormCheckbox,
    Combo: FormCombo,
    Constraint: FormConstraint,
    DatePicker: FormDatePicker,
    Field: FormField,
    FieldSet: FormFieldSet,
    Input: FormInput,
    Panel: FormPanel,
    PanelButtons: FormPanelButtons,
    Slider: FormSlider,
    YearPicker: FormYearPicker
}

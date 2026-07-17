import {FormField} from '~/widget/form/property'

import {isValidGridTransform} from '../../samplingGridValidation'

export const crsTransformField = new FormField()
    .predicate(isValidGridTransform, 'process.samplingDesign.panel.sampleArrangement.form.crsTransform.invalid')

import PropTypes from 'prop-types'

import {USAGE_DAYS, UsageStatistics} from '~/app/home/user/usageStatistics'
import {msg} from '~/translate'
import {Form} from '~/widget/form'

export const UserUsage = ({username}) =>
    <Form.FieldSet
        layout='vertical'
        label={msg('user.userDetails.form.usage.label', {days: USAGE_DAYS})}>
        <UsageStatistics username={username}/>
    </Form.FieldSet>

UserUsage.propTypes = {
    username: PropTypes.string.isRequired
}

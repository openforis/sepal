import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {msg} from '~/translate'
import {withActivators} from '~/widget/activation/activator'
import {refreshBudget} from '~/widget/budgetMonitor'
import {ButtonSelect} from '~/widget/buttonSelect'
import {refreshSessions} from '~/widget/sessionMonitor'

class _UsageMenuButton extends React.Component {
    render() {
        const {className, label, hint} = this.props
        return (
            <ButtonSelect
                chromeless
                look='transparent'
                size='large'
                air='less'
                additionalClassName={className}
                icon='dollar-sign'
                label={label}
                hint={hint}
                tooltip={msg('home.sections.user.report.tooltip')}
                tooltipPlacement='top'
                placement='above'
                hPlacement='over-right'
                noChevron
                options={this.getOptions()}
            />
        )
    }

    getOptions() {
        const {activator: {activatables: {userReport, userSessions}}} = this.props
        return [
            this.option({value: 'userReport', label: msg('user.report.title'), icon: 'chart-bar'}, userReport),
            this.option({value: 'userSessions', label: msg('user.report.sessions.title'), icon: 'server'}, userSessions)
        ]
    }

    // Both panels show figures that drift between pushes, so each opens on fresh ones.
    option(entry, {activate, canActivate}) {
        return {
            ...entry,
            disabled: !canActivate,
            onSelect: () => {
                refreshBudget()
                refreshSessions()
                activate()
            }
        }
    }
}

export const UsageMenuButton = compose(
    _UsageMenuButton,
    withActivators('userReport', 'userSessions')
)

UsageMenuButton.propTypes = {
    className: PropTypes.string,
    hint: PropTypes.any,
    label: PropTypes.string
}

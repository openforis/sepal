import PropTypes from 'prop-types'
import React from 'react'

import {refreshBudget} from '~/app/home/monitoring/budgetMonitor'
import {refreshSessions} from '~/app/home/monitoring/sessionMonitor'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {withActivators} from '~/widget/activation/activator'
import {ButtonSelect} from '~/widget/buttonSelect'

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
        const {activator: {activatables: {userReport, userSessions, globalUsage, globalSessions}}} = this.props
        // Only admins have the global panels, so only they get activatables for them.
        const globalOptions = [
            globalUsage?.activate && this.option({value: 'globalUsage', label: msg('user.report.globalUsage'), icon: 'users'}, globalUsage),
            globalSessions?.activate && this.option({value: 'globalSessions', label: msg('user.report.globalSessions'), icon: 'network-wired'}, globalSessions)
        ].filter(Boolean)
        return [
            ...(globalOptions.length
                ? [...globalOptions, {key: 'separator', group: true}]
                : []),
            this.option({value: 'userReport', label: msg('user.report.title'), icon: 'chart-bar'}, userReport),
            this.option({value: 'userSessions', label: msg('user.report.sessions.title'), icon: 'server'}, userSessions)
        ]
    }

    // The panels show figures that drift between pushes, so each opens on fresh ones.
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
    withActivators('userReport', 'userSessions', 'globalUsage', 'globalSessions')
)

UsageMenuButton.propTypes = {
    className: PropTypes.string,
    hint: PropTypes.any,
    label: PropTypes.string
}

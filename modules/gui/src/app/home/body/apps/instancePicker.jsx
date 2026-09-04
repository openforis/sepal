import PropTypes from 'prop-types'
import React from 'react'

import api from '~/apiRegistry'
import {appList} from '~/apps'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {Combo} from '~/widget/combo'
import {Panel} from '~/widget/panel/panel'

import {conflictingAssociations} from './appOpenPlan'
import styles from './instancePicker.module.css'
import {appRequirements, buildPickerOptions, defaultPickerValue, hasSuitableOption} from './instanceSuitability'

// Modal picker shown before starting a sandbox app that has no live instance
// association. Two combo sections: the user's running instances (unsuitable ones
// disabled) and the suitable new instance types (cheapest first). Default: first
// suitable running instance, else the cheapest suitable type.
class _InstancePicker extends React.Component {
    state = {
        report: null,
        value: null
    }

    constructor(props) {
        super(props)
        this.onChange = this.onChange.bind(this)
        this.onConfirm = this.onConfirm.bind(this)
        this.renderOption = this.renderOption.bind(this)
    }

    componentDidMount() {
        const {addSubscription} = this.props
        addSubscription(
            api.user.loadCurrentUserReport$({}).subscribe({
                next: report => this.setState({
                    report,
                    value: defaultPickerValue(this.pickerInputs(report))
                })
            })
        )
    }

    pickerInputs(report) {
        const {app} = this.props
        const sessions = report?.sessions || []
        return {
            sessions,
            instanceTypes: report?.instanceTypes || [],
            requirements: appRequirements(app),
            // The instances already hosting this app or a group-mate. conflictingAssociations is
            // the same function openPlan decides with, so the default the picker offers and the
            // plan that default produces cannot drift apart.
            groupSessionIds: conflictingAssociations(app, appList(), sessions)
                .map(({sessionId}) => sessionId),
            runningLabel: msg('apps.instancePicker.runningSection'),
            newLabel: msg('apps.instancePicker.newSection'),
            appCountLabel: count => msg('apps.count', {count})
        }
    }

    onChange(option) {
        this.setState({value: option.value})
    }

    onConfirm() {
        const {onConfirm} = this.props
        const {value} = this.state
        if (!value) {
            return
        }
        const [kind, id] = [value.slice(0, value.indexOf(':')), value.slice(value.indexOf(':') + 1)]
        onConfirm(kind === 'session' ? {sessionId: id} : {instanceType: id})
    }

    // Every option is a two-column row: what the instance IS on the left, what it provides and
    // costs right-aligned, so the options can be compared straight down the column instead of
    // across a separator. A running instance hosting apps lists them dimmed underneath.
    renderOption({title, detail, apps}) {
        return (
            <div className={styles.option}>
                <div className={styles.instance}>
                    <div className={styles.title}>{title}</div>
                    <div className={styles.detail}>{detail}</div>
                </div>
                {apps?.length
                    ? (
                        <div className={styles.apps}>
                            {apps.map((app, i) => this.renderApp(app, i))}
                        </div>
                    )
                    : null}
            </div>
        )
    }

    renderApp(app, i) {
        return (
            <div key={i}>{app}</div>
        )
    }

    pickerOptions(report) {
        return buildPickerOptions(this.pickerInputs(report)).map(section => ({
            ...section,
            options: section.options.map(option => ({...option, render: () => this.renderOption(option)}))
        }))
    }

    renderContent() {
        const {app} = this.props
        const {report, value} = this.state
        const requirements = appRequirements(app)
        if (report && !hasSuitableOption(this.pickerInputs(report))) {
            // Dead end: nothing running fits and no catalog type satisfies the floors —
            // tell the user why instead of showing an empty combo.
            return (
                <div>
                    {msg('apps.instancePicker.noSuitableInstance', {
                        cpu: requirements.minCpuCount,
                        gpu: requirements.minGpuCount ? ` / ${requirements.minGpuCount} GPU` : '',
                        ram: requirements.minRamGiB
                    })}
                </div>
            )
        }
        return (
            <Combo
                label={msg('apps.instancePicker.instance')}
                placeholder={msg('apps.instancePicker.placeholder')}
                options={report ? this.pickerOptions(report) : []}
                value={value}
                busyMessage={!report}
                onChange={this.onChange}
            />
        )
    }

    render() {
        const {app, onCancel} = this.props
        const {value} = this.state
        return (
            <Panel className={styles.panel} placement='modal' onBackdropClick={onCancel}>
                <Panel.Header
                    icon='server'
                    title={msg('apps.instancePicker.title', {app: app.label})}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Confirm
                            disabled={!value}
                            keybinding='Enter'
                            onClick={this.onConfirm}/>
                    </Panel.Buttons.Main>
                    <Panel.Buttons.Extra>
                        <Panel.Buttons.Cancel
                            keybinding='Escape'
                            onClick={onCancel}/>
                    </Panel.Buttons.Extra>
                </Panel.Buttons>
            </Panel>
        )
    }
}

export const InstancePicker = compose(
    _InstancePicker,
    connect(),
    withSubscriptions()
)

InstancePicker.propTypes = {
    app: PropTypes.object.isRequired,
    onCancel: PropTypes.func.isRequired,
    onConfirm: PropTypes.func.isRequired
}

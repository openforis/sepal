import PropTypes from 'prop-types'
import React from 'react'

import api from '~/apiRegistry'
import {appList} from '~/apps'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {select} from '~/store'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {Combo} from '~/widget/combo'
import {Panel} from '~/widget/panel/panel'
import {SessionName} from '~/widget/sessionName'

import {InstanceSpecsTag} from '../../instanceSpecs'
import {conflictingAssociations} from './appOpenPlan'
import styles from './instancePicker.module.css'
import {appRequirements, buildPickerOptions, defaultPickerValue, requirementSpecs} from './instanceSuitability'

const mapStateToProps = () => ({
    sessions: select('user.currentUserReport.sessions')
})

// Modal picker shown before starting a sandbox app that has no live instance
// association. Combo sections: the user's running instances and the new instance types
// (in catalog order). An app's requirements are a recommendation, not a restriction: the
// instances below them are listed dimmed, and picking one shows a warning.
// Default: first suitable running instance, else the cheapest suitable type.
// Without an app it picks the type of a new instance: no running instances, no requirements.
// Running instances follow the store, which the session ws keeps live, so instances started or
// stopped while the picker is open come and go; a picked instance that stops falls back to the default.
class _InstancePicker extends React.Component {
    state = {
        report: null,
        picked: null
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
                next: report => this.setState({report})
            })
        )
    }

    // The REST report supplies the instance types, which the session ws does not push, and the
    // sessions until the ws has delivered its first push.
    pickerInputs(report) {
        const {app, sessions: liveSessions} = this.props
        const sessions = app ? liveSessions || report?.sessions || [] : []
        return {
            sessions,
            instanceTypes: report?.instanceTypes || [],
            requirements: appRequirements(app),
            // The instances already hosting this app or a group-mate. conflictingAssociations is
            // the same function openPlan decides with, so the default the picker offers and the
            // plan that default produces cannot drift apart.
            groupSessionIds: app
                ? conflictingAssociations(app, appList(), sessions).map(({sessionId}) => sessionId)
                : [],
            runningLabel: msg('apps.instancePicker.runningSection'),
            newLabel: msg('apps.instancePicker.newSection'),
            newSsdLabel: msg('apps.instancePicker.newSsdSection'),
            appCountLabel: count => msg('apps.count', {count})
        }
    }

    onChange(option) {
        this.setState({picked: option.value})
    }

    onConfirm() {
        const {onConfirm} = this.props
        const value = this.value()
        if (!value) {
            return
        }
        const [kind, id] = [value.slice(0, value.indexOf(':')), value.slice(value.indexOf(':') + 1)]
        onConfirm(kind === 'session' ? {sessionId: id} : {instanceType: id})
    }

    // A new instance type's option is a two-column row: what the instance IS on the left, what it
    // provides and costs right-aligned, so the options can be compared straight down the column
    // instead of across a separator. A running instance shows its title only, and lists the apps it
    // hosts dimmed underneath.
    renderOption({title, instance, instanceType, apps}) {
        return (
            <div className={styles.option}>
                <div className={styles.instance}>
                    <div className={styles.title}>{instance ? this.renderInstanceTitle(instance) : title}</div>
                    {instanceType ? <InstanceSpecsTag instanceType={instanceType}/> : null}
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

    renderInstanceTitle({name, type}) {
        return <SessionName name={name} type={type}/>
    }

    renderApp(app, i) {
        return (
            <div key={i}>{app}</div>
        )
    }

    value() {
        const {report, picked} = this.state
        if (!report) {
            return null
        }
        const inputs = this.pickerInputs(report)
        const offered = buildPickerOptions(inputs).some(({options}) => options.some(({value}) => value === picked))
        return offered ? picked : defaultPickerValue(inputs)
    }

    pickerOptions(report) {
        return buildPickerOptions(this.pickerInputs(report)).map(section => ({
            ...section,
            options: section.options.map(option => ({...option, render: () => this.renderOption(option)}))
        }))
    }

    renderContent() {
        const {report} = this.state
        const value = this.value()
        const options = report ? this.pickerOptions(report) : []
        if (report && !options.length) {
            return (
                <div>{msg('apps.instancePicker.noInstanceType')}</div>
            )
        }
        return (
            <Combo
                label={msg('apps.instancePicker.instance')}
                placeholder={msg('apps.instancePicker.placeholder')}
                options={options}
                value={value}
                busyMessage={!report}
                warningMessage={this.belowRequirementsMessage(options)}
                onChange={this.onChange}
            />
        )
    }

    belowRequirementsMessage(options) {
        const {app} = this.props
        const value = this.value()
        const selected = options.flatMap(({options}) => options).find(option => option.value === value)
        return selected?.dimmed
            ? msg('apps.instancePicker.belowRequirements', {specs: requirementSpecs(appRequirements(app))})
            : null
    }

    render() {
        const {app, onCancel} = this.props
        const value = this.value()
        return (
            <Panel className={styles.panel} placement='modal' onBackdropClick={onCancel}>
                <Panel.Header
                    icon='server'
                    title={app
                        ? msg('apps.instancePicker.title', {app: app.label})
                        : msg('apps.instancePicker.newInstanceTitle')}/>
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
    connect(mapStateToProps),
    withSubscriptions()
)

InstancePicker.propTypes = {
    app: PropTypes.object,
    onCancel: PropTypes.func.isRequired,
    onConfirm: PropTypes.func.isRequired
}

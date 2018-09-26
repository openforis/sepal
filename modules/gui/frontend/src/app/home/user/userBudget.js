import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import {connect} from 'store'
import {msg} from 'translate'
import Icon from 'widget/icon'
import Portal from 'widget/portal'
import React from 'react'
import Tooltip from 'widget/tooltip'
import actionBuilder from 'action-builder'
import moment from 'moment'
import styles from './userBudget.module.css'

const mapStateToProps = (state) => {
    return {
        userReport: (state.user && state.user.currentUserReport) || {},
        panel: state.ui && state.ui.userBudget,
        modal: state.ui && state.ui.modal
    }
}

const action = (mode) =>
    actionBuilder('USER_BUDGET')
        .set('ui.userBudget', mode)
        .set('ui.modal', !!mode)
        .dispatch()

export const showUserBudget = () => {
    action('USER_BUDGET')
}

export const closePanel = () =>
    action()

const percent = (part, total) => {
    return (total > 0 ? 100 * part / total : 0).toFixed(0)
}
class UserBudget extends React.Component {
    buttonHandler() {
        const {panel, modal} = this.props
        panel
            ? closePanel()
            : !modal && showUserBudget()
    }

    renderResources() {
        // const {spending} = {
        //     spending: {
        //         monthlyInstanceBudget: 10.0,
        //         monthlyInstanceSpending: 0.0,
        //         monthlyStorageBudget: 10.0,
        //         monthlyStorageSpending: 0.0,
        //         storageQuota: 100.0,
        //         storageUsed: 0.0
        //     }
        // }
        const {spending} = this.props.userReport
        return (
            <div>
                <div className={styles.section}>{msg('user.report.resources.title')}</div>
                <table className={styles.resources}>
                    <thead>
                        <tr>
                            <th></th>
                            <th className={styles.data}>{msg('user.report.resources.quota')}</th>
                            <th className={styles.data}>{msg('user.report.resources.used')}</th>
                            <th className={styles.data}>{msg('user.report.resources.used%')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <th>{msg('user.report.resources.monthlyInstance')}</th>
                            <td>{spending.monthlyInstanceBudget}</td>
                            <td>{spending.monthlyInstanceSpending}</td>
                            <td>{percent(spending.monthlyInstanceSpending, spending.monthlyInstanceBudget)}%</td>
                        </tr>
                        <tr>
                            <th>{msg('user.report.resources.monthlyStorage')}</th>
                            <td>{spending.monthlyStorageBudget}</td>
                            <td>{spending.monthlyStorageSpending}</td>
                            <td>{percent(spending.monthlyStorageSpending, spending.monthlyStorageBudget)}%</td>
                        </tr>
                        <tr>
                            <th>{msg('user.report.resources.storage')}</th>
                            <td>{spending.storageQuota}</td>
                            <td>{spending.storageUsed}</td>
                            <td>{percent(spending.storageUsed, spending.storageQuota)}%</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        )
    }

    renderSessions() {
        const renderSessions = (sessions) => {
            return (
                <table className={styles.resources}>
                    <thead>
                        <tr>
                            <th>{msg('user.report.sessions.instanceType')}</th>
                            <th>{msg('user.report.sessions.time')}</th>
                            <th>{msg('user.report.sessions.cost')}</th>
                            <th>{msg('user.report.sessions.chargeGranularity')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sessions.map(renderSession)}
                    </tbody>
                </table>
            )
        }
        const renderNoSessions = () => (
            <div>{msg('user.report.sessions.noSessions')}</div>
        )
        const renderSession = (session) => {
            // const session = {
            //     'id': 'b9c6784f-84af-4b49-93bd-91ee57c0595c',
            //     'path': 'sandbox/session/b9c6784f-84af-4b49-93bd-91ee57c0595c',
            //     'username': 'paolini',
            //     'status': 'ACTIVE',
            //     'host': '54.188.53.50',
            //     'earliestTimeoutHours': 0.0,
            //     'instanceType': {
            //         'id': 'T2Small',
            //         'path': 'sandbox/instance-type/T2Small',
            //         'name': 't2.small',
            //         'description': '1 CPU / 2.0 GiB',
            //         'hourlyCost': 0.025
            //     },
            //     'creationTime': '2018-09-19T13:27:50',
            //     'costSinceCreation': 0.0
            // }
            return (
                <tr key={session.id}>
                    <td>{session.instanceType.name}</td>
                    <td>{moment(session.creationTime).format('ddd, DD MMM YYYY, hh:mm:ss')}</td>
                    <td>{session.costSinceCreation}</td>
                    <td>{session.instanceType.hourlyCost}</td>
                </tr>
            )
        }

        // const {sessions, instanceTypes} = this.props.userReport
        const {sessions} = sampleUserReport
        return (
            <React.Fragment>
                <div className={styles.section}>{msg('user.report.sessions.title')}</div>
                {sessions.length ? renderSessions(sessions) : renderNoSessions()}
            </React.Fragment>
        )
    }
    
    renderPanel() {
        return (
            <Portal>
                <Panel className={styles.panel} center modal>
                    <PanelHeader
                        icon='user'
                        title={msg('user.userBudget.title')}/>
                    <PanelContent>
                        <div className={styles.report}>
                            {this.renderResources()}
                            {this.renderSessions()}
                        </div>
                    </PanelContent>
                </Panel>
            </Portal>
        )
    }

    renderButton() {
        const {className, modal} = this.props
        return (
            <Tooltip msg='home.sections.user.info' disabled={modal}>
                <button className={className} onClick={() => this.buttonHandler()}>
                    <Icon name='dollar-sign'/> 0/h
                </button>
            </Tooltip>
        )
    }

    render() {
        const {panel} = this.props
        const showUserBudget = panel === 'USER_BUDGET'
        return (
            <React.Fragment>
                {this.renderButton()}
                {showUserBudget ? this.renderPanel() : null}
            </React.Fragment>
        )
    }
}

UserBudget.propTypes = {}

export default connect(mapStateToProps)(UserBudget)

const sampleUserReport = {
    'sessions': [{
        'id': 'b9c6784f-84af-4b49-93bd-91ee57c0595c',
        'path': 'sandbox/session/b9c6784f-84af-4b49-93bd-91ee57c0595c',
        'username': 'paolini',
        'status': 'ACTIVE',
        'host': '54.188.53.50',
        'earliestTimeoutHours': 0.0,
        'instanceType': {
            'id': 'T2Small',
            'path': 'sandbox/instance-type/T2Small',
            'name': 't2.small',
            'description': '1 CPU / 2.0 GiB',
            'hourlyCost': 0.025
        },
        'creationTime': '2018-09-19T13:27:50',
        'costSinceCreation': 0.0
    }],
    'instanceTypes': [{
        'id': 'T2Small',
        'path': 'sandbox/instance-type/T2Small',
        'name': 't2.small',
        'description': '1 CPU / 2.0 GiB',
        'hourlyCost': 0.025
    }, {
        'id': 'M3Medium',
        'path': 'sandbox/instance-type/M3Medium',
        'name': 'm3.medium',
        'description': '1 CPU / 3.75 GiB',
        'hourlyCost': 0.073
    }, {
        'id': 'M4Large',
        'path': 'sandbox/instance-type/M4Large',
        'name': 'm4.large',
        'description': '2 CPU / 8.0 GiB',
        'hourlyCost': 0.119
    }, {
        'id': 'M4Xlarge',
        'path': 'sandbox/instance-type/M4Xlarge',
        'name': 'm4.xlarge',
        'description': '4 CPU / 16.0 GiB',
        'hourlyCost': 0.238
    }, {
        'id': 'M42xlarge',
        'path': 'sandbox/instance-type/M42xlarge',
        'name': 'm4.2xlarge',
        'description': '8 CPU / 32.0 GiB',
        'hourlyCost': 0.475
    }, {
        'id': 'M44xlarge',
        'path': 'sandbox/instance-type/M44xlarge',
        'name': 'm4.4xlarge',
        'description': '16 CPU / 64.0 GiB',
        'hourlyCost': 0.95
    }, {
        'id': 'M410xlarge',
        'path': 'sandbox/instance-type/M410xlarge',
        'name': 'm4.10xlarge',
        'description': '40 CPU / 160.0 GiB',
        'hourlyCost': 2.377
    }, {
        'id': 'M416xlarge',
        'path': 'sandbox/instance-type/M416xlarge',
        'name': 'm4.16xlarge',
        'description': '64 CPU / 256.0 GiB',
        'hourlyCost': 3.803
    }, {
        'id': 'C4Large',
        'path': 'sandbox/instance-type/C4Large',
        'name': 'c4.large',
        'description': '2 CPU / 3.75 GiB',
        'hourlyCost': 0.113
    }, {
        'id': 'C4Xlarge',
        'path': 'sandbox/instance-type/C4Xlarge',
        'name': 'c4.xlarge',
        'description': '4 CPU / 7.5 GiB',
        'hourlyCost': 0.226
    }, {
        'id': 'C42xlarge',
        'path': 'sandbox/instance-type/C42xlarge',
        'name': 'c4.2xlarge',
        'description': '8 CPU / 15.0 GiB',
        'hourlyCost': 0.453
    }, {
        'id': 'C44xlarge',
        'path': 'sandbox/instance-type/C44xlarge',
        'name': 'c4.4xlarge',
        'description': '16 CPU / 30.0 GiB',
        'hourlyCost': 0.905
    }, {
        'id': 'C48xlarge',
        'path': 'sandbox/instance-type/C48xlarge',
        'name': 'c4.8xlarge',
        'description': '36 CPU / 60.0 GiB',
        'hourlyCost': 1.811
    }, {
        'id': 'R4Large',
        'path': 'sandbox/instance-type/R4Large',
        'name': 'r4.large',
        'description': '2 CPU / 15.25 GiB',
        'hourlyCost': 0.148
    }, {
        'id': 'R4Xlarge',
        'path': 'sandbox/instance-type/R4Xlarge',
        'name': 'r4.xlarge',
        'description': '4 CPU / 30.5 GiB',
        'hourlyCost': 0.296
    }, {
        'id': 'R42xlarge',
        'path': 'sandbox/instance-type/R42xlarge',
        'name': 'r4.2xlarge',
        'description': '8 CPU / 61.0 GiB',
        'hourlyCost': 0.593
    }, {
        'id': 'R44xlarge',
        'path': 'sandbox/instance-type/R44xlarge',
        'name': 'r4.4xlarge',
        'description': '16 CPU / 122.0 GiB',
        'hourlyCost': 1.186
    }, {
        'id': 'R48xlarge',
        'path': 'sandbox/instance-type/R48xlarge',
        'name': 'r4.8xlarge',
        'description': '32 CPU / 244.0 GiB',
        'hourlyCost': 2.371
    }, {
        'id': 'R416xlarge',
        'path': 'sandbox/instance-type/R416xlarge',
        'name': 'r4.16xlarge',
        'description': '64 CPU / 488.0 GiB',
        'hourlyCost': 4.742
    }, {
        'id': 'X116xlarge',
        'path': 'sandbox/instance-type/X116xlarge',
        'name': 'x1.16xlarge',
        'description': '64 CPU / 976.0 GiB',
        'hourlyCost': 8.003
    }, {
        'id': 'X132xlarge',
        'path': 'sandbox/instance-type/X132xlarge',
        'name': 'x1.32xlarge',
        'description': '128 CPU / 1920.0 GiB',
        'hourlyCost': 16.006
    }],
    'spending': {
        'monthlyInstanceBudget': 1.0,
        'monthlyInstanceSpending': 0.025,
        'monthlyStorageBudget': 1.0,
        'monthlyStorageSpending': 2.233275753451851E-5,
        'storageQuota': 20.0,
        'storageUsed': 9.6E-5
    }
}

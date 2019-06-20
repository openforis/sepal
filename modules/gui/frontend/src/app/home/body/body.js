import {CenteredProgress} from 'widget/progress'
import {compose} from 'compose'
import {connect, select} from 'store'
import {history, location} from 'route'
import {initGoogleMapsApi$} from '../map/map'
import {msg} from 'translate'
// import Account from './account/account'
import Apps from './apps/apps'
import Browse from './browse/browse'
import Process from './process/process'
import PropTypes from 'prop-types'
import React from 'react'
import Section from './section'
import Tasks from './tasks/tasks'
import Terminal from './terminal/terminal'
import Users from './users/users'
import styles from './body.module.css'

const mapStateToProps = () => ({
    location: location(),
    budgetExceeded: select('user.budgetExceeded'),
})

class Body extends React.Component {
    constructor(props) {
        super(props)
        this.props.asyncActionBuilder('INIT_GOOGLE_MAPS_API',
            initGoogleMapsApi$())
            .dispatch()
    }

    componentDidUpdate() {
        const {budgetExceeded, location} = this.props
        if (budgetExceeded && !['/browse', '/users'].includes(location.pathname))
            history().replace('/browse')
        else if (this.props.location.pathname === '/')
            history().replace('/process')
    }

    render() {
        const {action, className} = this.props
        if (!action('INIT_GOOGLE_MAPS_API').dispatched) {
            const progressMessageId = action('LOAD_GOOGLE_MAPS_API_KEY').dispatching
                ? 'body.initializing-google-maps'
                : 'body.starting-sepal'
            return <CenteredProgress title={msg(progressMessageId)} className={className}/>
        }
        return (
            <div className={className}>
                <div className={styles.sections}>
                    <Section path='/process' captureMouseEvents={false}>
                        <Process/>
                    </Section>
                    <Section path='/browse'>
                        <Browse/>
                    </Section>
                    <Section path='/app-launch-pad'>
                        <Apps/>
                    </Section>
                    <Section path='/terminal'>
                        <Terminal/>
                    </Section>
                    <Section path='/tasks'>
                        <Tasks/>
                    </Section>
                    <Section path='/users'>
                        <Users/>
                    </Section>
                    {/* <Section path='/account'>
                        <Account/>
                    </Section> */}
                </div>
            </div>
        )
    }
}

Body.propTypes = {
    className: PropTypes.string,
    location: PropTypes.object
}

export default compose(
    Body,
    connect(mapStateToProps)
)

import {BottomBar, Content as SectionContent, SectionLayout} from 'widget/sectionLayout'
import {Button} from 'widget/button'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './workflow.module.css'

const WorkflowContext = React.createContext()

class Workflow extends React.Component {
    state = {stepName: null}

    render() {
        const {steps, start} = this.props
        const {stepName} = this.state
        const step = steps[stepName || start]
        if (!step)
            throw new Error(`Unknown step: '${stepName || start}'. Available steps: ${Object.keys(steps)}`)
        return (
            <WorkflowContext.Provider value={{switchStep: this.switchStep.bind(this)}}>
                {step}
            </WorkflowContext.Provider>
        )
    }

    switchStep(stepName) {
        this.setState(prevState => ({...prevState, stepName}))
    }

    static Step = ({children}) =>
        <SectionLayout>{children}</SectionLayout>

    static Content = ({children}) =>
        <SectionContent>{children}</SectionContent>

    static Bar = ({children}) =>
        <BottomBar className={styles.content}>{children}</BottomBar>

    static Left = ({children}) =>
        <div className={styles.left}>{children}</div>

    static Center = ({children}) =>
        <div className={styles.center}>{children}</div>

    static Right = ({children}) =>
        <div className={styles.right}>{children}</div>

    static NextButton = ({label, step, disabled}) =>
        <WorkflowContext.Consumer>
            {({switchStep}) =>
                <Button
                    disabled={disabled}
                    label={label}
                    icon='forward'
                    iconPlacement='right'
                    onClick={() => switchStep(step)}/>
            }
        </WorkflowContext.Consumer>

    static BackButton = ({label, step, disabled}) =>
        <WorkflowContext.Consumer>
            {({switchStep}) =>
                <Button
                    disabled={disabled}
                    label={label}
                    icon='backward'
                    iconPlacement='left'
                    onClick={() => switchStep(step)}/>
            }
        </WorkflowContext.Consumer>
}

Workflow.propTypes = {
    start: PropTypes.string.isRequired,
    steps: PropTypes.object.isRequired,
}

Workflow.NextButton.propTypes = {
    step: PropTypes.string.isRequired,
    disabled: PropTypes.any,
    label: PropTypes.string
}

export default Workflow


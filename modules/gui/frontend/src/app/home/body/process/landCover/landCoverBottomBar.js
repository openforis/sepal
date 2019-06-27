import {BottomBar} from 'widget/sectionLayout'
import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Form, form} from 'widget/form/form'
import {compose} from 'compose'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React, {Component} from 'react'
import styles from './landCoverBottomBar.module.css'

const fields = {
    primitive: new Form.Field()
}

class LandCoverBottomBar extends Component {
    render() {
        const hasNext = this.hasNext()
        return <BottomBar padding className={styles.container}>
            <div className={styles.left}>
                {this.renderBackButton()}
            </div>
            <div className={[
                styles.middle,
                hasNext ? styles.hasNext : null
            ].join(' ')}>
                {this.renderPrimitiveSelector()}
                {hasNext ? this.renderNextPrimitiveButton() : null}
            </div>
            <ButtonGroup type='horizontal-nowrap'>
                {this.renderCreatePrimitiveButton()}
                {this.renderNextButton()}
            </ButtonGroup>
        </BottomBar>
    }

    renderBackButton() {
        return (
            <Button
                additionalClassName={styles.back}
                look={'transparent'}
                // onClick={() => console.log('Going back to composites')}
            >
                <Icon name='backward'/>
                <span>Composite</span>
            </Button>
        )
    }

    renderPrimitiveSelector() {
        const {inputs: {primitive}} = this.props
        const primitives = [
            {value: 'forest', label: 'Forest'},
            {value: 'plantation', label: 'Plantation'},
            {value: 'shrub', label: 'Shrub'},
            {value: 'grass', label: 'Grass'},
            {value: 'crop', label: 'Crop'},
            {value: 'paramo', label: 'Paramo'},
            {value: 'water', label: 'Water'},
            {value: 'urban', label: 'Urban'},
            {value: 'barren', label: 'Barren'}
        ]
        return (
            <div className={styles.primitiveSelector}>
                <Form.Combo
                    input={primitive}
                    options={primitives}
                    placement='above'/>
            </div>
        )
    }

    renderNextPrimitiveButton() {
        return (
            <Button
                icon='angle-double-right'
                tooltip={'Select next primitive'}
                chromeless
                // onClick={() => console.log('Next primitive')}
                additionalClassName={styles.nextPrimitive}/>
        )
    }

    renderCreatePrimitiveButton() {
        return (
            <Button
                look={'transparent'}
                // onClick={() => console.log('Starting to create primitive')}
                label='Create primitive'/>
        )
    }

    renderNextButton() {
        return (
            <Button
                disabled={!this.allPrimitivesCreated()}
                additionalClassName={styles.next}
                look={'transparent'}
                // onClick={() => console.log('Navigate to assemblage')}
            >
                <span>Assemblage</span>
                <Icon name='forward'/>
            </Button>
        )
    }

    hasNext() {
        return true
        // return false
    }

    allPrimitivesCreated() {
        return true
        // return false
    }
}

LandCoverBottomBar.propTypes = {
    recipeId: PropTypes.string.isRequired
}

export default compose(
    LandCoverBottomBar,
    form({fields})
)

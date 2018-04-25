import PropTypes from 'prop-types'
import React from 'react'
import {Msg, msg} from 'translate'
import {Constraints, ErrorMessage, form, Input} from 'widget/form'
import {RecipeActions, RecipeState} from '../../mosaicRecipe'
import ConfirmationButtons from '../confirmationButtons'
import styles from './dates.module.css'
import Rx from 'rxjs'
import Hammer from 'hammerjs'

const inputs = {
    // country: new Constraints()
    //     .notBlank('process.mosaic.panel.areaOfInterest.form.country.required'),
}

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.id)
    return {
        values: recipe('dates')
    }
}

class Dates extends React.Component {
    constructor(props) {
        super(props)
        this.recipe = RecipeActions(props.id)        

        // this.dayFrom = React.createRef()
        // this.dayTo = React.createRef()
        // this.yearFrom = React.createRef()
        // this.yearTo = React.createRef()

        this.left = React.createRef()
        this.right = React.createRef()
        this.top = React.createRef()
        this.bottom = React.createRef()
        this.rect = React.createRef()
    }
    render() {
        const date = new Date().toDateString()
        const {className, form, inputs: {country}} = this.props
        return (
            <div className={className}>
                <div className={styles.container}>
                    <div className={styles.title}>
                        <Msg id={'process.mosaic.panel.dates.title'}/>
                    </div>
                    <div className={styles.body}>
                        {/* <div className={styles.dot} ref={this.dayFrom}/> */}
                        <div className={styles.rect} ref={this.rect}/>
                        <div className={styles.handle} ref={this.left}/>
                        <div className={styles.handle} ref={this.right}/>
                        <div className={styles.handle} ref={this.top}/>
                        <div className={styles.handle} ref={this.bottom}/>
                    </div>
                    <div className={styles.footer}>
                        footer
                    </div>
                </div>
            </div>
        )
    }
    componentDidMount() {
        this.dragDrop(this.left.current, {x: 100, y: 60}, ({x, _}) => {
            this.rect.current.style.left = x + 'px'
        })
        this.dragDrop(this.right.current, {x: 200, y: 60}, ({x, _}) => {
            this.rect.current.style.width = x - parseInt(this.rect.current.style.left, 10) + 'px'
        })
        this.dragDrop(this.top.current, {x: 150, y: 40}, ({_, y}) => {
            this.rect.current.style.top = y + 'px'
        })
        this.dragDrop(this.bottom.current, {x: 150, y: 80}, ({_, y}) => {
            this.rect.current.style.height = y - parseInt(this.rect.current.style.top, 10) + 'px'
        })
    }
    dragDrop(element, start, callback) {
        if (start) {
            element.style.left = start.x + 'px'
            element.style.top = start.y + 'px'
            callback(start)
        }
        const drag$ = (element) => {
            const hammerPan = new Hammer(element, {
                threshold: 1
            })
            // hammerPan.get('pan').set({ direction: Hammer.DIRECTION_HORIZONTAL })

            const pan$ = Rx.Observable.fromEvent(hammerPan, 'panstart panmove panend')
            const panStart$ = pan$.filter(e => e.type === 'panstart')
            const panMove$ = pan$.filter(e => e.type === 'panmove')
            const panEnd$ = pan$.filter(e => e.type === 'panend')
            const animationFrame$ = Rx.Observable.interval(0, Rx.Scheduler.animationFrame)

            const lerp = (rate) => {
                return ({x, y}, targetValue) => {
                    const mapValue = (value, targetValue) => {
                        const delta = (targetValue - value) * rate
                        return value + delta
                    }      
                    return {
                        x: mapValue(x, targetValue.x),
                        y: mapValue(y, targetValue.y)
                    }
                }
            }

            const drag$ = panStart$
                .switchMap(() => {
                    const start = {
                        x: parseInt(element.style.left, 10) || 0,
                        y: parseInt(element.style.top, 10) || 0
                    }
                    return panMove$
                        .map(pmEvent => ({
                            x: start.x + pmEvent.deltaX,
                            y: start.y + pmEvent.deltaY,
                        }))
                        .takeUntil(panEnd$)
                })

            return animationFrame$
                .withLatestFrom(drag$, (_, p) => p)
                .scan(lerp(.1))
        }
                
        drag$(element)
            .subscribe((pos) => {
                element.style.top = pos.y + 'px'
                element.style.left = pos.x + 'px'
                callback(pos)
            })
    }
}

Dates.propTypes = {
    id: PropTypes.string,
    className: PropTypes.string,
    form: PropTypes.object,
    inputs: PropTypes.shape({
    }),
    action: PropTypes.func,
    values: PropTypes.object
}

export default form(inputs, mapStateToProps)(Dates)

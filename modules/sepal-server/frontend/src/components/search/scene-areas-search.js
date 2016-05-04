/**
 * @author Mino Togna
 */
var EventBus   = require( '../event/event-bus' )
var Events     = require( '../event/events' )
var Loader     = require( '../loader/loader' )
var Animation  = require( '../animation/animation' )
var DatePicker = require( '../date-picker/date-picker' )
var countries  = require( './countries.js' )

var SceneAreasSearch = function () {

    this.form       = null
    this.formNotify = null

    this.Request = {

        countryCode: ''
        , from: {
            year: -1
            , month: -1
            , day: -1
        }
        , to: {
            year: -1
            , month: -1
            , day: -1
        }
        , targetDay: {
            month: -1
            , day: -1
        }

    }

    var $this = this
    EventBus.addEventListener( Events.MAP.SCENE_AREA_CLICK, function ( e, sceneAreaId ) {
        $this.getSceneArea( sceneAreaId )
    } )
}

SceneAreasSearch.prototype.setForm = function ( form ) {
    var $this       = this
    this.form       = $( form )
    this.formNotify = this.form.find( '.form-notify' )

    var country = form.find( '#search-form-country' )
    country.autocomplete( {
        lookup: countries
        , minChars: 0
        , autoSelectFirst: true
        , onSelect: function ( selection ) {
            if ( selection ) {
                var cCode = selection.data
                var cName = selection.value

                // SceneAreasSearch.countryCode = cCode
                $this.Request.countryCode = cCode
                EventBus.dispatch( Events.MAP.ZOOM_TO, null, cName )
            }
        }
        , tabDisabled: true
    } )

    var fromDate      = DatePicker.newInstance( this.form.find( '.from' ) )
    fromDate.onChange = function ( datePicker ) {
        $this.Request.from.year  = datePicker.getYear()
        $this.Request.from.month = datePicker.getMonth()
        $this.Request.from.day   = datePicker.getDay()
    }

    var toDate      = DatePicker.newInstance( this.form.find( '.to' ) )
    toDate.onChange = function ( datePicker ) {
        $this.Request.to.year  = datePicker.getYear()
        $this.Request.to.month = datePicker.getMonth()
        $this.Request.to.day   = datePicker.getDay()
    }
    toDate.hide()

    var targetDay      = DatePicker.newInstance( this.form.find( '.target-day' ), true )
    targetDay.onChange = function ( datePicker ) {
        $this.Request.targetDay.month = datePicker.getMonth()
        $this.Request.targetDay.day   = datePicker.getDay()
    }
    targetDay.hide()

    this.form.find( '.from-label' ).click( function () {
        toDate.hide()
        targetDay.hide()
        fromDate.show()
    } )
    this.form.find( '.to-label' ).click( function () {
        fromDate.hide()
        targetDay.hide()
        toDate.show()
    } )
    this.form.find( '.target-day-label' ).click( function () {
        fromDate.hide()
        toDate.hide()
        targetDay.show()
    } )

    this.form.submit( function ( e ) {
        e.preventDefault()
        $this.requestSceneAreas()
    } )

}

SceneAreasSearch.prototype.requestSceneAreas = function () {
    var $this = this

    if ( $.trim( this.Request.countryCode ) == '' ) {
        this.formNotify.html( 'Please select a valid COUNTRY' )
        Animation.animateIn( this.formNotify )
    }
    else if ( this.Request.from.year <= 0 || this.Request.from.month <= 0 || this.Request.from.day <= 0 ) {
        this.formNotify.html( 'Please select a valid FROM date' )
        Animation.animateIn( this.formNotify )
    }
    else if ( this.Request.to.year <= 0 || this.Request.to.month <= 0 || this.Request.to.day <= 0 ) {
        this.formNotify.html( 'Please select a valid TO date' )
        Animation.animateIn( this.formNotify )
    }

    else {

        // if valid, form gets submitted

        var data   = { countryIso: this.Request.countryCode }
        var params = {
            url: '/api/data/sceneareas'
            , data: data
            , beforeSend: function () {
                Animation.animateOut( $this.formNotify )
                $this.formNotify.html( '' )

                Loader.show()
                EventBus.dispatch( Events.SECTION.REDUCE, null )
            }
            , success: function ( response ) {
                EventBus.dispatch( Events.MAP.LOAD_SCENE_AREAS, null, response )
                Loader.hide( { delay: 300 } )
            }
        }
        EventBus.dispatch( Events.AJAX.REQUEST, null, params )

    }
}


SceneAreasSearch.prototype.getSceneArea = function ( sceneAreaId ) {
    // get('/data/sceneareas/{sceneAreaId}') 

    // params.targetDay //MM-dd
    // params.startDate //YYYY-MM-dd
    // params.endDate  //YYYY-MM-dd
    var SEP  = '-'
    var data = {
        startDate: this.Request.from.year + SEP + this.Request.from.month + SEP + this.Request.from.day
        , endDate: this.Request.to.year + SEP + this.Request.to.month + SEP + this.Request.to.day
        , targetDay: this.Request.targetDay.month + SEP + this.Request.targetDay.day
    }

    var params = {
        url: '/api/data/sceneareas/' + sceneAreaId
        , data: data
        , beforeSend: function () {
            Loader.show()
        }
        , success: function ( response ) {

            EventBus.dispatch( Events.SECTION.SHOW, null, 'scene-images-selection' )
            EventBus.dispatch( Events.SECTION.SCENE_IMAGES_SELECTION.UPDATE, null, response )

            Loader.hide( { delay: 500 } )
        }
    }

    EventBus.dispatch( Events.AJAX.REQUEST, null, params )
}

var _instance = new SceneAreasSearch()

module.exports = _instance
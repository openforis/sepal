/**
 * @author Mino Togna
 */
var EventBus   = require( '../event/event-bus' )
var Events     = require( '../event/events' )
var Loader     = require( '../loader/loader' )
var DatePicker = require( '../date-picker/date-picker' )
var countries  = require( './countries.js' )

var SceneAreasSearch = function () {

    this.form = null

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
    var $this = this
    this.form = $( form )

    var country = form.find( '#search-form-country' )
    country.autocomplete( {
        lookup: countries
        , minChars: 0
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
    var data   = { countryIso: this.Request.countryCode }
    var params = {
        url: '/api/data/sceneareas'
        , data: data
        , beforeSend: function () {
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

SceneAreasSearch.prototype.getSceneArea = function ( sceneAreaId ) {

    var params = {
        url: '/api/data/sceneareas/' + sceneAreaId
        , beforeSend: function () {
            Loader.show()
        }
        , success: function ( response ) {

            EventBus.dispatch( Events.SECTION.SEARCH.SHOW_SCENE_AREA, null, response )

            // loadSceneArea( response )
            console.log( response )
            Loader.hide( { delay: 500 } )
        }
    }

    EventBus.dispatch( Events.AJAX.REQUEST, null, params )
}

var _instance = new SceneAreasSearch()

module.exports = _instance
/**
 * @author Mino Togna
 */
require( './scenes-selection.scss' )

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

var SModel                = require( './../search/model/search-model' )
var SectionScenes         = require( './views/section-scenes' )
var SectionSelectedScenes = require( './views/section-selected-scenes' )
var SectionFilterScenes   = require( './views/section-filter-scenes-v' )

var html               = null
var section            = null
var currentSceneAreaId = null
var dataSet            = null
var selectedSensors    = null
var availableSensors   = null

var state = {}

var init = function () {
    
    var appSection = $( '#app-section' ).find( '.scene-images-selection' )
    if ( appSection.children().length <= 0 ) {
        var template = require( './scenes-selection.html' )
        html         = $( template( {} ) )
        
        appSection.append( html )
        
        section = appSection.find( '#scene-images-selection' )
        
        var selectionScenesContainer = section.find( '.selection-section' )
        SectionScenes.init( selectionScenesContainer )
        SectionFilterScenes.init( selectionScenesContainer )
        SectionSelectedScenes.init( section.find( '.selected-section' ) )
    }
    
}

var setDataSet = function ( value ) {
    dataSet         = value
    selectedSensors = Object.keys( SModel.getSensors( dataSet ) )
    
    SectionScenes.setDataSet( dataSet )
    SectionFilterScenes.setDataSet( dataSet )
    SectionSelectedScenes.setDataSet( dataSet )
}

var reset = function ( sceneAreaId, avSensors ) {
    availableSensors = avSensors ? avSensors : []
    
    SectionScenes.reset( sceneAreaId )
    
    // scene area id is changed, therefore selected section reset as well
    if ( !(sceneAreaId && currentSceneAreaId === sceneAreaId) ) {
        SectionSelectedScenes.reset( sceneAreaId )
        
        SectionFilterScenes.setSortWeight( state.sortWeight )
        SectionFilterScenes.setOffsetToTargetDay( state.offsetToTargetDay )
        updateSensors()
        SectionFilterScenes.showButtons()
        
    }
    
    currentSceneAreaId = sceneAreaId
}

var updateSensors = function () {
    SectionFilterScenes.setSensors( availableSensors, state.sensors )
}
// Functions for selection section
var add           = function ( sceneImage, filterHidden, selected ) {
    
    SectionScenes.add( sceneImage, filterHidden, selected )
    if ( selected ) {
        SectionSelectedScenes.add( sceneImage )
    }
}

var select   = function ( sceneAreaId, sceneImage ) {
    if ( sceneAreaId === currentSceneAreaId ) {
        
        SectionScenes.hideScene( sceneImage )
        SectionSelectedScenes.add( sceneImage )
    }
}
var deselect = function ( sceneAreaId, sceneImage ) {
    if ( sceneAreaId === currentSceneAreaId ) {
        SectionSelectedScenes.remove( sceneImage )
        SectionScenes.showScene( sceneImage )
    }
}

var updateState = function ( e, s ) {
    state = s
}

EventBus.addEventListener( Events.SECTION.SEARCH.MODEL.ACTIVE_CHANGED, updateState )


module.exports = {
    init                  : init
    , setDataSet          : setDataSet
    , reset               : reset
    , add                 : add
    , select              : select
    , deselect            : deselect
    , hideScenesBySensor  : SectionScenes.hideScenesBySensor
    , showScenesBySensor  : SectionScenes.showScenesBySensor
    , setSortWeight       : SectionFilterScenes.setSortWeight
    , setOffsetToTargetDay: SectionFilterScenes.setOffsetToTargetDay
    , updateSensors       : updateSensors
}
/**
 * @author Mino Togna
 */
require( './scenes-selection.scss' )

var SearchParams          = require( '../search/search-params' )
var SectionScenes         = require( './views/section-scenes' )
var SectionSelectedScenes = require( './views/section-selected-scenes' )
var SectionFilterScenes   = require( './views/section-filter-scenes-v' )

var html               = null
var section            = null
var currentSceneAreaId = null
var dataSet            = null
var selectedSensors    = null
var availableSensors   = null

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
    dataSet = value
    if ( dataSet == SearchParams.SENSORS.LANDSAT ) {
        selectedSensors = SearchParams.landsatSensors
    } else if ( dataSet == SearchParams.SENSORS.SENTINEL2 ) {
        selectedSensors = SearchParams.sentinel2Sensors
    }
    
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
        
        SectionFilterScenes.setSortWeight( SearchParams.sortWeight )
        SectionFilterScenes.setOffsetToTargetDay( SearchParams.offsetToTargetDay )
        updateSensors()
        SectionFilterScenes.showButtons()
        
    }
    
    currentSceneAreaId = sceneAreaId
}

var updateSensors = function () {
    SectionFilterScenes.setSensors( availableSensors, selectedSensors )
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
    // , setSensors          : SectionFilterScenes.setSensors
    , updateSensors       : updateSensors
}
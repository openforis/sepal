/**
 * Application Events class
 *
 * @author Mino Togna
 */

var Events = {
    
    AJAX: {
        REQUEST : 'ajax.request'
        , GET   : 'ajax.get'
        , POST  : 'ajax.post'
        , DELETE: 'ajax.delete'
    }
    
    , APP: {
        LOAD            : 'app.load'
        , DESTROY       : 'app.destroy'
        , USER_LOGGED_IN: 'app.user_logged_in'
    }
    
    , LOGIN: {
        HIDE  : 'login.hide'
        , SHOW: 'login.show'
    }
    
    , SECTION: {
        CLOSE_ALL: 'section.close_all'
        , SHOW   : 'section.show'
        , SHOWN  : 'section.shown'
        , REDUCE : 'section.reduce'
        
        , NAV_MENU: {
            LOADED    : 'section.nav_menu.loaded'
            , COLLAPSE: 'section.nav_menu_collapse'
        }
        
        , SEARCH: {
            // SHOW_SCENE_AREA: 'section.search.show_scene_area'
            FORM_SUBMIT         : 'section.search.form_submit'
            , SCENE_AREAS_LOADED: 'section.search.scene_areas_loaded'
            
            , SEARCH_PARAMS: {
                WEIGHT_CHANGE              : 'section.search.search_params.weight_change'
                , WEIGHT_CHANGED           : 'section.search.search_params.weight_changed'
                , OFFSET_TARGET_DAY_CHANGE : 'section.search.search_params.offset_target_day_change'
                , OFFSET_TARGET_DAY_CHANGED: 'section.search.search_params.offset_target_day_changed'
                , SELECT_SENSOR            : 'section.search.search_params.select_sensor'
                , DESELECT_SENSOR          : 'section.search.search_params.deselect_sensor'
                , SENSORS_CHANGED          : 'section.search.search_params.sensors_changed'
                , MIN_SCENES_CHANGE        : 'section.search.search_params.min_scenes_change'
                , MIN_SCENES_CHANGED       : 'section.search.search_params.min_scenes_changed'
                , MAX_SCENES_CHANGE        : 'section.search.search_params.max_scenes_change'
                , MAX_SCENES_CHANGED       : 'section.search.search_params.max_scenes_changed'
            }
            
        }
        
        , SEARCH_RETRIEVE: {
            BEST_SCENES      : 'section.search_retrieve.best_scenes'
            , RETRIEVE_SCENES: 'section.search_retrieve.retrieve_scenes'
            , PREVIEW_MOSAIC : 'section.search_retrieve.preview_mosaic'
            , RETRIEVE_MOSAIC: 'section.search_retrieve.retrieve_mosaic'
            , COLLAPSE_VIEW  : 'section.search_retrieve.collapse_view'
        }
        
        , BROWSE: {
            NAV_ITEM_CLICK : 'section.browse.nav_item_click'
            , DOWNLOAD_ITEM: 'section.browse.download_item'
            , DELETE_ITEM  : 'section.browse.delete_item'
        }
        
        , PROCESS: {}
        
        , TERMINAL: {}
        
        , SCENES_SELECTION: {
            RESET          : 'section.scenes_selection.reset'
            , SELECT       : 'section.scenes_selection.select'
            , DESELECT     : 'section.scenes_selection.deselect'
            , RELOAD_SCENES: 'section.scenes_selection.reload_scenes'
        }
        
        , TASK_MANAGER: {
            REMOVE_TASK   : 'section.task_manager.remove_task'
            , CANCEL_TASK : 'section.task_manager.cancel_task'
            , EXECUTE_TASK: 'section.task_manager.execute_task'
            , CHECK_STATUS: 'section.task_manager.check_status'
            , UPDATED     : 'section.task_manager.updated'
        }
        
        , USER : {
            REMOVE_SESSION     : 'section.user.remove_session'
            , SAVE_USER_DETAILS: 'section.user.save_user_details'
            , CHANGE_PASSWORD  : 'section.user.change_password'
        }
        , USERS: {
            LIST_FILTER_CHANGE: 'section.users.list_filter_change'
            , SELECT_USER     : 'section.users.select_user'
            , SHOW_USERS_LIST : 'section.users.show_users_list'
            , SHOW_INVITE_USER: 'section.users.show_invite_user'
            , SHOW_EDIT_USER  : 'section.users.show_edit_user'
            , SHOW_DELETE_USER: 'section.users.show_delete_user'
        }
    }
    
    , MAP: {
        ZOOM_TO                       : 'map.zoom_to'
        , ZOOM_CHANGED                : 'map.zoom_changed'
        // , LOAD_SCENE_AREAS: 'map.load_scene_areas'
        , SCENE_AREA_CLICK            : 'map.scene_area_click'
        , ADD_LAYER                   : 'map.add_layer'
        , ADD_EE_LAYER                : 'map.add_ee_layer'
        , REMOVE_EE_LAYER             : 'map.remove_ee_layer'
        , EE_LAYER_TOGGLE_VISIBILITY  : 'map.remove_ee_layer_toggle_visibility'
        , SCENE_AREA_RESET            : 'map.scene_area_reset'
        , SCENE_AREA_TOGGLE_VISIBILITY: 'map.scene_area_toggle_visibility'
        , ADD_OVERLAY_MAP_TYPE        : 'map.add_overlay_map_type'
        , REMOVE_OVERLAY_MAP_TYPE     : 'map.remove_overlay_map_type'
        , POLYGON_DRAW                : 'map.polygon_draw'
        , POLYGON_DRAWN               : 'map.polygon_drawn'
        , POLYGON_CLEAR               : 'map.polygon_clear'
    }
    
    // events that occur when a model changes
    , MODEL: {
        SCENE_AREA: {
            CHANGE: 'model.scene_area_change'
        }
    }
    
    , USER: {
        USER_DETAILS_LOADED         : "user.user_details_loaded"
        , USER_SANDBOX_REPORT_LOADED: "user.user_sandbox_report_loaded"
        , RELOAD_USER_DETAILS       : "user.reload_user_details"
        , PASSWORD_CHANGED          : "user.password_changed"
        , LOGGED_OUT                : "user.logged_out"
    }
    
    , ALERT: {
        SHOW_INFO: "alert.show_info"
    }
    
    , APP_MANAGER: {
        OPEN_IFRAME   : 'app_manager.open_iframe'
        , OPEN_RSTUDIO: 'app_manager.open_rstudio'
        , OPEN_DATAVIS: 'app_manager.open_datavis'
        , CLOSED      : 'app_manager.closed'
    }
    
    , APPS: {
        DATA_VIS: {
            MAP_INITIALIZED                    : 'apps.data_vis.map_initialized'
            , ADD_MAP_LAYER                    : 'apps.data_vis.add_map_layer'
            , FORCE_UPDATE_LAYER               : 'apps.data_vis.force_update_layer'
            , REMOVE_MAP_LAYER                 : 'apps.data_vis.remove_map_layer'
            , MAP_LAYER_TILES_LOADING          : 'apps.data_vis.map_layer_tiles_loading'
            , MAP_TILES_LOADED                 : 'apps.data_vis.map_tiles_loaded'
            , MAP_LAYER_CHANGE_OPACITY         : 'apps.data_vis.map_layer_change_opacity'
            , MAP_LAYER_ZOOM_TO                : 'apps.data_vis.map_layer_zoom_to'
            , LAYER_DELETE                     : 'apps.data_vis.layer_delete'
            , ADD_FILE                         : 'apps.data_vis.add_file'
            , LAYERS_LOADED                    : 'apps.data_vis.layers_loaded'
            , UPDATE_LAYER_OPTION_BTNS_POSITION: 'apps.data_vis.update_layer_option_btns_position'
        }
    }
    
}

module.exports = Events
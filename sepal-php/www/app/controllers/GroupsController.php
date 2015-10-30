<?php

class GroupsController extends \BaseController {

	protected $layout = 'layouts.master';
	
	function __construct() {
		//apply filter since group management only for admin users
		$this->beforeFilter(function(){
		  if(Session::get('is_admin')=='no'){
			return Redirect::to('search')
			->with('error', 'Permission denied!');
			}
		});
		
    	}
	//POST process form inputs from add Roles form
	public function create() {
	// Validation rules
        $rules = array(
            'groupName' => 'required|min:4',
            'groupDescription' => 'required',
        );
    
    // Validate the inputs
        $v = Validator::make( Input::all(), $rules );

    // Setting attribute for readable format   
		$attributeNames = array(
		   'groupName' => 'group name',   
		   'groupDescription' => 'group description',
		);
        $v->setAttributeNames($attributeNames);
    
    // Was the validation successful?
        if ( $v->fails() )
        {
        	return Redirect::to('groups')
			->withErrors($v)
			->withInput();
        	
        }else{

        	$group = new Group;
			$group->group_name    = Input::get('groupName');
			$group->group_desc    = Input::get('groupDescription');
			// save our groups
			$group->save();
			return Redirect::to('groups')
			->with('message', 'Group added!');
        }

        //return View::make('success');
	}

//POST process form inputs from add Roles form
	public function update($grpId=NULL) {
	// Validation rules
        $rules = array(
            'groupName' => 'required|min:4',
            'groupDescription' => 'required',
        );
    
    // Validate the inputs
        $v = Validator::make( Input::all(), $rules );

    // Setting attribute for readable format   
		$attributeNames = array(
		   'groupName' => 'group name',   
		   'groupDescription' => 'group description',
		);
        $v->setAttributeNames($attributeNames);
    
    // Was the validation successful?
        if ( $v->fails() )
        {
        	return Redirect::to('groups/edit/'.$grpId)
			->withErrors($v)
			->withInput();
        	
        }else{

        	$group = Group::find($grpId);
			$group->group_name    = Input::get('groupName');
			$group->group_desc    = Input::get('groupDescription');
			// save our groups
			$group->save();
			return Redirect::to('groups')
			->with('message', 'Group added!');
        }

        //return View::make('success');
	}
	//POST process form inputs from add Roles form
	public function edit($grpId=NULL) {
	
        $this->index($grpId); 
	}

	//insert newly blocked groups
	public function insert()
	{

		$groupSystem = new GroupSystem;
		$groupSystem->group_name    = Input::get('groupName');
		// save our groups
		$groupSystem->save();
	}
	//delete newly blocked groups
	public function delete()
	{
		$groupName= Input::get('groupName');
		$groupSystem = GroupSystem::where('group_name','=',$groupName);
		$groupSystem->delete();
	}
	//GET display collection of Groups 
	public function index($grpId=NULL)
	{

		exec("sudo cut -d: -f1 /etc/group",$groupList);
		$currentData=array();
		$groupSystem = GroupSystem::get();
		$restrictedGroups = RestrictedGroup::get(array('name'))->lists('name');
		//remove base linux groups to hide them in UI
		$groupList = array_diff($groupList, $restrictedGroups);
		if (!empty($groupSystem))
		{
			foreach ($groupSystem as $groupData)
			{
				$currentData[]=$groupData->group_name;
			}	
		}
		//$data['currentData']=$currentData;
		$groupLists=$groupList;
		$forUpdate='';
		$perPage='';
		//finally render our template.
		$this->layout->content = View::make('groups.group',array('currentData'=>$currentData,'groupLists'=>$groupList,'forUpdate'=>$forUpdate,'perPage'=>$perPage));
		$this->layout->heading = 'Group Details';
	}

	function removeGroup($grpId = NULL){


		//TBD add user permission to remove group
		$this->layout = '';

		$Group = Group::find($grpId);
		$Group->delete();
	return Redirect::to('groups')
		->with('message', 'User removed!');
        }


}
?>

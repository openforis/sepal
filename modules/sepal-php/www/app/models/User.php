<?php

use Illuminate\Auth\Reminders\RemindableInterface;
use Illuminate\Auth\Reminders\RemindableTrait;
use Illuminate\Auth\UserInterface;
use Illuminate\Auth\UserTrait;

class User extends Eloquent implements UserInterface, RemindableInterface {

	use UserTrait, RemindableTrait;

	/**
	 * The database table used by the model.
	 *
	 * @var string
	 */
	protected $table = 'users';

	/**
	 * The attributes excluded from the model's JSON form.
	 *
	 * @var array
	 */
	protected $hidden = array('password', 'remember_token');

	/**
	 * Setting the relationship with roles through users_roles table
	 *
	 * @return mixed
	 */
	public function roles() 
	{
        	return $this->belongsToMany('Role','users_roles');
   	}

	/**
	 * Setting the relationship with groups through users_groups table
	 *
	 * @return mixed
	 */
	public function groups() 
	{
        	return $this->belongsToMany('Group','users_groups');
   	}

	/**
	 * return boolean result if has permission or not.
	 *
	 * @return string
	 */
	public function hasRole($role)
	{
		foreach ($this->roles as $role_detail) { 
			$rolename = $role_detail->role_name;
			if($rolename == $role)
				return true;     
	   
		}        
		return false;
	}
	/**
	 * Get all users
	 *
	 * @return mixed
	 */
	public function getUsers($paginationNumber){
		
		$queryBuilder=User::with('groups','roles');
		$queryBuilder=$queryBuilder->orderBy('id', 'DESC');
		//$queryBuilder=$queryBuilder->leftJoin('users_roles', 'users.id', '=', 'users_roles.user_id');
		$queryResult=$queryBuilder->paginate(20);
		return $queryResult;
	}
	
	public function userGroups(){
		return $this->hasMany('Usergroup','user_id');
	}


}

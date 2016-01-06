<ul>

@if (isset($userFolder) && count($userFolder)>0)
@foreach ($userFolder as $folderKey=>$folderValue)
{{-- */$folderwithpath =$folderPath.'/'.$folderValue;/* --}}
{{-- */$file_ext =pathinfo($folderwithpath,PATHINFO_EXTENSION)/* --}}
@if(isset($file_ext) && $file_ext !="")

@else
<li >
<article>



<span class="pull-left sprite right-arrow subarrow"></span>
   <span class="sprite folder-sml pull-left"></span>
    <div  class="folderPath" path="{{ $folderPath.'/'.$folderValue }}"> {{ $folderValue }}</div>

   
</article>
<div class="subfolder" ></div>
</li>
@endif
@endforeach
@endif
</ul>


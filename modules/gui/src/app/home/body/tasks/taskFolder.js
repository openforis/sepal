// The folder of a task's recipe. Tasks made before projects were renamed folders hold the old key.
export const taskFolderId = taskInfo => taskInfo?.folderId ?? taskInfo?.projectId

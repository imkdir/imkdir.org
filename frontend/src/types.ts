export type FolderType = "folder" | "project" | "tag";

export interface Folder {
  id: string;
  name: string;
  type: FolderType;
  isPublic: boolean;
  parentId: string | null;
  children?: Folder[]; // Populated when fetching nested trees
  createdAt: string;
  updatedAt: string;
}

export interface Prompt {
  id: string;
  name?: string | null;
  content: string;
  isPublic: boolean;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFolderDTO {
  name: string;
  type: FolderType;
  parentId: string | null;
  isPublic?: boolean;
}

export interface UpdateFolderDTO {
  name?: string;
  parentId?: string | null;
  isPublic?: boolean;
}

export interface CreatePromptDTO {
  name?: string | null;
  content: string;
  folderId: string | null;
  isPublic?: boolean;
}

export interface UpdatePromptDTO {
  name?: string | null;
  content?: string;
  folderId?: string | null;
  isPublic?: boolean;
}

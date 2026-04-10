import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "../utils";
import {
  Folder as FolderIcon,
  Plus,
  ChevronRight,
  ChevronDown,
  FileText,
  Pencil,
  Trash2,
  Check,
  Search,
} from "lucide-react";
import type { Folder, Prompt } from "../types";

export interface ColumnItem {
  id: string;
  isFolder: boolean;
  name?: string | null; // For folders and prompts
  content?: string; // For prompts
  rawData: Folder | Prompt;
}

export interface Column {
  id: string;
  folderId: string | null;
  items: ColumnItem[];
}

export interface SidebarLayoutProps {
  columns: Column[];
  selectedFolders: string[];
  selectedPromptId: string | null;
  onSelectFolder: (columnIndex: number, folderId: string) => void;
  onSelectPrompt: (columnIndex: number, promptId: string) => void;
  onCreateFolder: (parentId: string | null) => void;
  onUpdateFolder?: (id: string, name: string) => void;
  onToggleFolderPublic?: (id: string, isPublic: boolean) => void;
  onDeleteFolder?: (id: string) => void;
  onInlineCreateFolder?: (parentId: string | null, name: string) => void;
  canManage?: boolean;
  children: ReactNode; // This will be the Preview Pane
}

function TreeNode({
  item,
  columnIndex,
  columns,
  folderById,
  selectedFolders,
  selectedPromptId,
  onSelectFolder,
  onSelectPrompt,
  onCreateFolder,
  onUpdateFolder,
  onToggleFolderPublic,
  onDeleteFolder,
  onInlineCreateFolder,
  canManage,
}: {
  item: ColumnItem;
  columnIndex: number;
  columns: Column[];
  folderById: Map<string, Folder>;
  selectedFolders: string[];
  selectedPromptId: string | null;
  onSelectFolder: (columnIndex: number, folderId: string) => void;
  onSelectPrompt: (columnIndex: number, promptId: string) => void;
  onCreateFolder: (parentId: string | null) => void;
  onUpdateFolder?: (id: string, name: string) => void;
  onToggleFolderPublic?: (id: string, isPublic: boolean) => void;
  onDeleteFolder?: (id: string) => void;
  onInlineCreateFolder?: (parentId: string | null, name: string) => void;
  canManage?: boolean;
}) {
  const isFolder = item.isFolder;
  const folderData = isFolder ? (item.rawData as Folder) : null;
  const promptData = !isFolder ? (item.rawData as Prompt) : null;
  const parentFolder = promptData?.folderId
    ? folderById.get(promptData.folderId) || null
    : null;
  const isPrivatePromptInPublicFolder = Boolean(
    promptData && !promptData.isPublic && parentFolder?.isPublic,
  );
  const isExpanded = isFolder && selectedFolders[columnIndex] === item.id;
  const isSelectedPrompt = !isFolder && selectedPromptId === item.id;

  const nextColumn = columns[columnIndex + 1];

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(
    item.name || item.content?.split("\n")[0] || "Empty prompt",
  );
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isAddingSubfolder, setIsAddingSubfolder] = useState(false);
  const [newSubfolderName, setNewSubfolderName] = useState("");

  const handleClick = () => {
    if (isEditing) return;
    if (isFolder) {
      if (isExpanded) {
        // Collapse the folder
        // Calling onSelectPrompt with a dummy ID truncates the selectedFolders path
        // up to this column, effectively closing it and its children.
        onSelectPrompt(columnIndex, "");
      } else {
        // Expand the folder
        onSelectFolder(columnIndex, item.id);
      }
    } else {
      onSelectPrompt(columnIndex, item.id);
    }
  };

  return (
    <div className="flex flex-col w-full">
      <button
        onClick={handleClick}
        style={{ paddingLeft: `${columnIndex * 1 + 0.75}rem` }}
        className={cn(
          "w-full flex items-center justify-between pr-3 py-1.5 text-sm transition-all text-left group border border-transparent outline-none focus-visible:ring-1 focus-visible:ring-indigo-500",
          isSelectedPrompt
            ? "bg-indigo-600 text-white"
            : "text-neutral-300 hover:bg-neutral-800",
          isExpanded && !isSelectedPrompt && "bg-neutral-800/50",
        )}
      >
        <div className="flex items-center gap-2 overflow-hidden flex-1 pointer-events-none">
          {isFolder ? (
            <span
              className={cn(
                "w-4 h-4 shrink-0",
                canManage && "pointer-events-auto cursor-pointer",
              )}
              onClick={(e) => {
                if (!canManage) return;
                e.stopPropagation();
                if (onToggleFolderPublic) {
                  onToggleFolderPublic(item.id, !folderData?.isPublic);
                }
              }}
              title={
                canManage
                  ? folderData?.isPublic
                    ? "Make private"
                    : "Make public"
                  : undefined
              }
            >
              <FolderIcon
                className={cn(
                  "w-4 h-4",
                  folderData?.isPublic
                    ? isExpanded
                      ? "text-indigo-400 fill-current"
                      : "text-neutral-500 fill-current"
                    : isExpanded
                      ? "text-indigo-400"
                      : "text-neutral-500",
                )}
              />
            </span>
          ) : (
            <FileText
              className={cn(
                "w-4 h-4 shrink-0",
                isSelectedPrompt ? "text-indigo-200" : "text-neutral-600",
                isPrivatePromptInPublicFolder ? "opacity-30" : "opacity-100",
              )}
            />
          )}
          {isEditing ? (
            <input
              autoFocus
              className="flex-1 bg-transparent border-none outline-none text-sm text-neutral-200 pointer-events-auto"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setIsEditing(false);
                  if (onUpdateFolder) onUpdateFolder(item.id, editName);
                } else if (e.key === "Escape") {
                  setIsEditing(false);
                  setEditName(
                    item.name || item.content?.split("\n")[0] || "Empty prompt",
                  );
                }
              }}
              onBlur={() => {
                setIsEditing(false);
                if (onUpdateFolder) onUpdateFolder(item.id, editName);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate flex items-center gap-1.5">
              {isFolder
                ? item.name
                : item.name || item.content?.split("\n")[0] || "Empty prompt"}
            </span>
          )}
        </div>

        {isFolder && !isEditing && (
          <div className="flex items-center gap-1 shrink-0">
            {canManage && (
              <>
                <div
                  className="p-1 opacity-0 group-hover:opacity-100 hover:bg-neutral-700 rounded transition-all pointer-events-auto"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditing(true);
                  }}
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5 text-neutral-400" />
                </div>
                <div
                  className="p-1 opacity-0 group-hover:opacity-100 hover:bg-neutral-700 rounded transition-all pointer-events-auto"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isConfirmingDelete) {
                      if (onDeleteFolder) onDeleteFolder(item.id);
                      setIsConfirmingDelete(false);
                    } else {
                      setIsConfirmingDelete(true);
                      setTimeout(() => setIsConfirmingDelete(false), 3000);
                    }
                  }}
                  title="Delete"
                >
                  {isConfirmingDelete ? (
                    <Check className="w-3.5 h-3.5 text-red-400" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5 text-neutral-400" />
                  )}
                </div>
                <div
                  className="p-1 opacity-0 group-hover:opacity-100 hover:bg-neutral-700 rounded transition-all pointer-events-auto"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAddingSubfolder(true);
                    // Also ensure it opens if they are adding a subfolder
                    if (!isExpanded) {
                      onSelectFolder(columnIndex, item.id);
                    }
                  }}
                  title="New Subfolder"
                >
                  <Plus className="w-3.5 h-3.5 text-neutral-400" />
                </div>
              </>
            )}
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-neutral-400 pointer-events-none" />
            ) : (
              <ChevronRight className="w-4 h-4 text-neutral-500 pointer-events-none" />
            )}
          </div>
        )}
      </button>

      {/* Render children recursively if expanded */}
      {isExpanded && (nextColumn || isAddingSubfolder) && (
        <div className="flex flex-col w-full">
          {isAddingSubfolder && canManage && (
            <div
              style={{ paddingLeft: `${(columnIndex + 1) * 1 + 0.75}rem` }}
              className="w-full flex items-center pr-3 py-1.5 text-sm transition-all text-left group border border-transparent outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 bg-neutral-800/20"
            >
              <div className="flex items-center gap-2 overflow-hidden flex-1">
                <FolderIcon className="w-4 h-4 shrink-0 text-indigo-400 fill-indigo-400/20" />
                <input
                  autoFocus
                  className="flex-1 bg-transparent border-none outline-none text-sm text-neutral-200"
                  value={newSubfolderName}
                  onChange={(e) => setNewSubfolderName(e.target.value)}
                  placeholder="New Folder"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setIsAddingSubfolder(false);
                      if (onInlineCreateFolder)
                        onInlineCreateFolder(item.id, newSubfolderName);
                      else onCreateFolder(item.id); // fallback
                      setNewSubfolderName("");
                    } else if (e.key === "Escape") {
                      setIsAddingSubfolder(false);
                      setNewSubfolderName("");
                    }
                  }}
                  onBlur={() => {
                    setIsAddingSubfolder(false);
                    if (newSubfolderName) {
                      if (onInlineCreateFolder)
                        onInlineCreateFolder(item.id, newSubfolderName);
                      else onCreateFolder(item.id); // fallback
                    }
                    setNewSubfolderName("");
                  }}
                />
              </div>
            </div>
          )}
          {nextColumn?.items.length === 0 && !isAddingSubfolder ? (
            <div
              style={{ paddingLeft: `${(columnIndex + 1) * 1 + 2.5}rem` }}
              className="py-1.5 text-xs text-neutral-600 italic pointer-events-none"
            >
              Empty folder
            </div>
          ) : (
            nextColumn?.items.map((childItem) => (
              <TreeNode
                key={childItem.id}
                item={childItem}
                columnIndex={columnIndex + 1}
                columns={columns}
                folderById={folderById}
                selectedFolders={selectedFolders}
                selectedPromptId={selectedPromptId}
                onSelectFolder={onSelectFolder}
                onSelectPrompt={onSelectPrompt}
                onCreateFolder={onCreateFolder}
                onUpdateFolder={onUpdateFolder}
                onToggleFolderPublic={onToggleFolderPublic}
                onDeleteFolder={onDeleteFolder}
                onInlineCreateFolder={onInlineCreateFolder}
                canManage={canManage}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function SidebarLayout({
  columns,
  selectedFolders,
  selectedPromptId,
  onSelectFolder,
  onSelectPrompt,
  onCreateFolder,
  onUpdateFolder,
  onToggleFolderPublic,
  onDeleteFolder,
  onInlineCreateFolder,
  canManage = true,
  children,
}: SidebarLayoutProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const folderById = useMemo(() => {
    const map = new Map<string, Folder>();
    for (const col of columns) {
      for (const item of col.items) {
        if (item.isFolder) {
          map.set(item.id, item.rawData as Folder);
        }
      }
    }
    return map;
  }, [columns]);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === "undefined") return 288;
    const savedWidth = Number(window.localStorage.getItem("imkdir-sidebar-width"));
    if (Number.isFinite(savedWidth)) {
      return Math.max(240, Math.min(560, savedWidth));
    }
    return 288;
  });
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("imkdir-sidebar-width", String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (event: MouseEvent) => {
      const left = containerRef.current?.getBoundingClientRect().left ?? 0;
      const nextWidth = Math.max(240, Math.min(560, event.clientX - left));
      setSidebarWidth(nextWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // columns[0] contains the root items
  const rootColumn = columns[0];

  const filteredRootItems = rootColumn?.items.filter((item) => {
    if (!searchQuery) return true;
    if (item.isFolder) {
      return (item.name || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
    }
    return false; // hide prompts at the root when searching
  });

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex h-full w-full bg-neutral-950 text-neutral-100 font-sans overflow-hidden",
        isResizing && "cursor-col-resize select-none",
      )}
    >
      {/*
        The Fixed Sidebar Area (Tree View).
      */}
      <div
        className="relative shrink-0 h-full border-r border-neutral-800 bg-neutral-900/40 overflow-hidden"
        style={{ width: `${sidebarWidth}px` }}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Search Header */}
          <div className="h-14 p-3 border-b border-neutral-800 flex justify-between items-center bg-neutral-900 shrink-0">
            <div className="flex items-center gap-2 w-full bg-neutral-800/50 rounded-md px-2 py-1.5 focus-within:ring-1 focus-within:ring-indigo-500">
              <Search className="w-4 h-4 text-neutral-500 shrink-0" />
              <input
                type="text"
                placeholder={
                  canManage ? "Search or create folder..." : "Search folders..."
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border-none outline-none text-sm text-neutral-200 placeholder-neutral-500"
              />
            </div>
          </div>

          {/* Tree Items */}
          <div className="flex-1 overflow-y-auto py-2">
            {canManage &&
              searchQuery &&
              !filteredRootItems?.some((item) => item.isFolder) && (
                <button
                  onClick={() => {
                    if (onInlineCreateFolder) onInlineCreateFolder(null, searchQuery);
                    else onCreateFolder(null); // Fallback
                    setSearchQuery("");
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 transition-colors text-left group"
                >
                  <Plus className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span className="truncate">Create "{searchQuery}"</span>
                </button>
              )}
            {filteredRootItems?.map((item) => (
              <TreeNode
                key={item.id}
                item={item}
                columnIndex={0}
                columns={columns}
                folderById={folderById}
                selectedFolders={selectedFolders}
                selectedPromptId={selectedPromptId}
                onSelectFolder={onSelectFolder}
                onSelectPrompt={onSelectPrompt}
                onCreateFolder={onCreateFolder}
                onUpdateFolder={onUpdateFolder}
                onToggleFolderPublic={onToggleFolderPublic}
                onDeleteFolder={onDeleteFolder}
                onInlineCreateFolder={onInlineCreateFolder}
                canManage={canManage}
              />
            ))}
          </div>
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          className={cn(
            "absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-indigo-500/30",
            isResizing && "bg-indigo-500/50",
          )}
          onMouseDown={(event) => {
            event.preventDefault();
            setIsResizing(true);
          }}
        />
      </div>

      {/*
        The Outlet / Preview Area.
      */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#141414] overflow-hidden">
        {children}
      </div>
    </div>
  );
}

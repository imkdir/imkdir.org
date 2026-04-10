import { useState, useEffect, useMemo, type FormEvent } from "react";
import {
  FileText,
  Copy,
  Check,
  Trash2,
  Eye,
  Edit2,
  X,
  Lock,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  ApiError,
  getFolders,
  getPrompts,
  getAuthStatus,
  getStoredAuthToken,
  setAuthToken,
  createPrompt,
  createFolder,
  updateFolder,
  deleteFolder,
  updatePrompt,
  deletePrompt,
} from "./api";
import type { Folder, Prompt } from "./types";
import { useGlobalPaste } from "./components/useGlobalPaste";
import { SidebarLayout } from "./components/SidebarLayout";

export default function App() {
  const [authToken, setAuthTokenState] = useState<string | null>(
    () => getStoredAuthToken() || null,
  );
  const [secretKeyInput, setSecretKeyInput] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);

  // The 'path' of selected folders. E.g., ['root-folder-id', 'child-folder-id']
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  // The ID of the selected file/prompt.
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [editingContent, setEditingContent] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setAuthToken(authToken);
      setIsAuthReady(false);

      try {
        const [authStatus, fData, pData] = await Promise.all([
          getAuthStatus(),
          getFolders(),
          getPrompts(),
        ]);

        setIsOwner(authStatus.isOwner);
        setFolders(fData);
        setPrompts(pData);
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setIsAuthReady(true);
      }
    };

    fetchData();
  }, [authToken]);

  useEffect(() => {
    setSecretKeyInput(authToken || "");
  }, [authToken]);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const requireOwner = () => {
    if (isOwner) return true;
    showToast("Owner access required");
    return false;
  };

  const handleMutationError = (error: unknown, fallbackMessage: string) => {
    if (error instanceof ApiError && error.status === 403) {
      setIsOwner(false);
      showToast("Owner access required");
      return;
    }
    console.error(fallbackMessage, error);
    showToast(fallbackMessage);
  };

  const getDefaultVisibilityForFolder = (folderId: string | null) => {
    if (!folderId) return true;
    const folder = folders.find((f) => f.id === folderId);
    return folder ? folder.isPublic : true;
  };

  useGlobalPaste(async (pastedText) => {
    if (!requireOwner()) return;

    try {
      if (selectedPromptId) {
        const updatedPrompt = await updatePrompt(selectedPromptId, {
          content: pastedText,
        });
        setPrompts((prev) =>
          prev.map((p) => (p.id === selectedPromptId ? updatedPrompt : p)),
        );
        setEditingContent(null);
        showToast("Pasted text saved to current file");
      } else {
        const targetFolderId =
          selectedFolders.length > 0
            ? selectedFolders[selectedFolders.length - 1]
            : null;
        const newPrompt = await createPrompt({
          content: pastedText,
          folderId: targetFolderId,
          isPublic: getDefaultVisibilityForFolder(targetFolderId),
        });
        setPrompts((prev) => [newPrompt, ...prev]);
        showToast("Pasted text saved as new prompt");
      }
    } catch (error) {
      handleMutationError(error, "Failed to save prompt");
    }
  });

  const handleCopyPrompt = (content: string) => {
    navigator.clipboard.writeText(content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
    showToast("Copied to clipboard");
  };

  const handleDeletePrompt = async (id: string) => {
    if (!requireOwner()) return;

    try {
      await deletePrompt(id);
      setPrompts((prev) => prev.filter((p) => p.id !== id));
      if (selectedPromptId === id) {
        setSelectedPromptId(null);
        setIsConfirmingDelete(false);
      }
    } catch (error) {
      handleMutationError(error, "Failed to delete prompt");
    }
  };

  const handleUpdatePromptName = async (id: string, newName: string) => {
    if (!requireOwner()) return;

    try {
      const updatedPrompt = await updatePrompt(id, { name: newName });
      setPrompts((prev) => prev.map((p) => (p.id === id ? updatedPrompt : p)));
    } catch (error) {
      handleMutationError(error, "Failed to update name");
    }
  };

  const handleCreateFolder = async (parentId: string | null) => {
    if (!requireOwner()) return;

    const name = prompt("Enter folder name:");
    if (!name) return;
    try {
      const newFolder = await createFolder({
        name,
        type: "folder",
        parentId,
        isPublic: getDefaultVisibilityForFolder(parentId),
      });
      setFolders((prev) => [...prev, newFolder]);
    } catch (error) {
      handleMutationError(error, "Failed to create folder");
    }
  };

  const handleInlineCreateFolder = async (
    parentId: string | null,
    name: string,
  ) => {
    if (!requireOwner()) return;
    if (!name) return;
    try {
      const newFolder = await createFolder({
        name,
        type: "folder",
        parentId,
        isPublic: getDefaultVisibilityForFolder(parentId),
      });
      setFolders((prev) => [...prev, newFolder]);
    } catch (error) {
      handleMutationError(error, "Failed to create folder");
    }
  };

  const handleUpdateFolder = async (id: string, name: string) => {
    if (!requireOwner()) return;

    try {
      const updatedFolder = await updateFolder(id, { name });
      setFolders((prev) => prev.map((f) => (f.id === id ? updatedFolder : f)));
    } catch (error) {
      handleMutationError(error, "Failed to update folder");
    }
  };

  const handleDeleteFolder = async (id: string) => {
    if (!requireOwner()) return;

    try {
      await deleteFolder(id);
      setFolders((prev) => prev.filter((f) => f.id !== id));
      setSelectedFolders((prev) => {
        const index = prev.indexOf(id);
        if (index !== -1) {
          return prev.slice(0, index);
        }
        return prev;
      });
    } catch (error) {
      handleMutationError(error, "Failed to delete folder");
    }
  };

  const handleToggleFolderPublic = async (id: string, isPublic: boolean) => {
    if (!requireOwner()) return;

    try {
      const updatedFolder = await updateFolder(id, { isPublic });
      setFolders((prev) => prev.map((f) => (f.id === id ? updatedFolder : f)));
      showToast(
        updatedFolder.isPublic
          ? "Folder is now public"
          : "Folder is now private",
      );
    } catch (error) {
      handleMutationError(error, "Failed to update folder visibility");
    }
  };

  const handleTogglePromptPublic = async (id: string, isPublic: boolean) => {
    if (!requireOwner()) return;

    try {
      const updatedPrompt = await updatePrompt(id, { isPublic });
      setPrompts((prev) => prev.map((p) => (p.id === id ? updatedPrompt : p)));
      showToast(isPublic ? "Prompt is now public" : "Prompt is now private");
    } catch (error) {
      handleMutationError(error, "Failed to update prompt visibility");
    }
  };

  useEffect(() => {
    setSelectedPromptId((prev) => {
      if (!prev) return prev;
      return prompts.some((p) => p.id === prev) ? prev : null;
    });

    setSelectedFolders((prev) => {
      const visibleFolderIds = new Set(folders.map((f) => f.id));
      const next: string[] = [];

      for (const id of prev) {
        if (!visibleFolderIds.has(id)) break;
        next.push(id);
      }

      return next;
    });
  }, [folders, prompts]);

  // Build the array of columns to display based on the selected path.
  const columns = useMemo(() => {
    const cols = [];
    const visibleFolderIds = new Set(folders.map((f) => f.id));

    const buildItems = (folderId: string | null) => {
      const fItems = folders
        .filter((f) => f.parentId === folderId)
        .map((f) => ({
          id: f.id,
          isFolder: true as const,
          name: f.name,
          rawData: f,
        }));
      const pItems = prompts
        .filter((p) => {
          if (p.folderId === folderId) return true;

          // A public prompt can still be shown if its private parent folder is hidden.
          if (
            folderId === null &&
            p.folderId &&
            !visibleFolderIds.has(p.folderId)
          ) {
            return true;
          }

          return false;
        })
        .map((p) => ({
          id: p.id,
          isFolder: false as const,
          name: p.name,
          content: p.content,
          rawData: p,
        }));

      return [...fItems, ...pItems].sort((a, b) => {
        // Folders always bubble to the top
        if (a.isFolder && !b.isFolder) return -1;
        if (!a.isFolder && b.isFolder) return 1;
        // Sort folders alphabetically
        if (a.isFolder && b.isFolder) {
          return a.name!.localeCompare(b.name!);
        }
        // Sort files (prompts) by creation date (newest first)
        return (
          new Date((b.rawData as Prompt).createdAt).getTime() -
          new Date((a.rawData as Prompt).createdAt).getTime()
        );
      });
    };

    // Always push the root column (parentId = null)
    cols.push({
      id: "root",
      folderId: null,
      items: buildItems(null),
    });

    // Push subsequent columns for every selected folder in the path
    for (let i = 0; i < selectedFolders.length; i++) {
      const folderId = selectedFolders[i];
      cols.push({
        id: folderId,
        folderId,
        items: buildItems(folderId),
      });
    }

    return cols;
  }, [folders, prompts, selectedFolders]);

  const activePrompt = prompts.find((p) => p.id === selectedPromptId);
  const activePromptParentFolder = activePrompt?.folderId
    ? folders.find((folder) => folder.id === activePrompt.folderId) || null
    : null;
  const canTogglePromptVisibility = Boolean(
    isOwner && activePrompt && activePromptParentFolder?.isPublic,
  );

  const currentContent =
    editingContent !== null ? editingContent : activePrompt?.content || "";
  const hasChanges =
    Boolean(isOwner) &&
    Boolean(activePrompt) &&
    currentContent !== activePrompt?.content;

  const handleSaveContent = async () => {
    if (!requireOwner()) return;
    if (!activePrompt || !hasChanges) return;
    try {
      const updatedPrompt = await updatePrompt(activePrompt.id, {
        content: currentContent,
      });
      setPrompts((prev) =>
        prev.map((p) => (p.id === activePrompt.id ? updatedPrompt : p)),
      );
      setEditingContent(null);
      showToast("Saved changes");
    } catch (error) {
      handleMutationError(error, "Failed to save changes");
    }
  };

  const handleSubmitSecretKey = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = secretKeyInput.trim();
    setAuthTokenState(normalized || null);
    setIsConfirmingDelete(false);
    setEditingContent(null);
  };

  const handleSwitchToViewerMode = () => {
    setAuthTokenState(null);
    setSecretKeyInput("");
    setIsOwner(false);
    setIsConfirmingDelete(false);
    setEditingContent(null);
    showToast("Switched to viewer mode");
  };

  const hasInvalidToken = Boolean(authToken) && isAuthReady && !isOwner;

  return (
    <div className="flex flex-col h-screen w-full bg-neutral-950 text-neutral-100 font-sans overflow-hidden">
      {/* --- Top Header --- */}
      <header className="h-14 border-b border-neutral-800 flex items-center px-4 shrink-0 bg-neutral-950">
        <h1 className="text-xl font-bold flex items-center">
          <span className="text-indigo-500">imkdir</span>.org
        </h1>
        <div className="ml-auto flex items-center gap-3">
          <span
            className={`text-xs px-2 py-1 rounded border ${
              isOwner
                ? "text-emerald-300 bg-emerald-400/10 border-emerald-400/30"
                : "text-neutral-300 bg-neutral-800 border-neutral-700"
            }`}
          >
            {isOwner ? "Owner" : "Viewer"}
          </span>
          {hasInvalidToken && (
            <span className="text-xs text-amber-300 bg-amber-300/10 border border-amber-300/30 px-2 py-1 rounded">
              Invalid secret key
            </span>
          )}
          {!isOwner ? (
            <form
              onSubmit={handleSubmitSecretKey}
              className="flex items-center gap-2"
            >
              <input
                type="password"
                value={secretKeyInput}
                onChange={(e) => setSecretKeyInput(e.target.value)}
                placeholder="Enter Secret Key"
                className="h-8 w-44 px-2.5 text-xs rounded border border-neutral-700 bg-neutral-900 text-neutral-200 placeholder-neutral-500 outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="submit"
                className="text-xs px-2.5 py-1.5 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition-colors"
              >
                Unlock
              </button>
            </form>
          ) : (
            <button
              onClick={handleSwitchToViewerMode}
              className="text-xs px-2.5 py-1.5 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition-colors"
            >
              Switch to Viewer
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-hidden relative">
        <SidebarLayout
          columns={columns}
          selectedFolders={selectedFolders}
          selectedPromptId={selectedPromptId}
          onSelectFolder={(columnIndex, folderId) => {
            setSelectedFolders((prev) => [
              ...prev.slice(0, columnIndex),
              folderId,
            ]);
            setSelectedPromptId(null);
            setEditingContent(null);
            setIsConfirmingDelete(false);
          }}
          onSelectPrompt={(columnIndex, promptId) => {
            setSelectedFolders((prev) => prev.slice(0, columnIndex));
            setSelectedPromptId(promptId);
            setEditingContent(null);
          }}
          onCreateFolder={handleCreateFolder}
          onUpdateFolder={handleUpdateFolder}
          onToggleFolderPublic={handleToggleFolderPublic}
          onDeleteFolder={handleDeleteFolder}
          onInlineCreateFolder={handleInlineCreateFolder}
          canManage={isOwner}
        >
          <div className="flex-1 flex flex-col h-full relative">
            {/* --- Preview Pane (Visible only when a file/prompt is selected) --- */}
            {selectedPromptId && activePrompt ? (
              <div className="flex-1 flex flex-col bg-[#141414] z-10 border-l border-neutral-800 overflow-hidden">
                {/* Preview Toolbar */}
                <div className="h-14 border-b border-neutral-800 flex items-center justify-between px-6 shrink-0 bg-neutral-900/80">
                  <div className="flex items-center gap-2 flex-1 mr-4">
                    <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                    <input
                      key={activePrompt.id}
                      type="text"
                      className="bg-transparent border-none outline-none text-sm font-medium text-neutral-300 placeholder-neutral-600 flex-1 truncate focus:ring-1 focus:ring-indigo-500/50 rounded px-1 -ml-1 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                      placeholder="Untitled Prompt"
                      defaultValue={activePrompt.name || ""}
                      readOnly={!isOwner}
                      onBlur={(e) => {
                        if (
                          isOwner &&
                          e.target.value !== (activePrompt.name || "")
                        ) {
                          handleUpdatePromptName(
                            activePrompt.id,
                            e.target.value,
                          );
                        }
                      }}
                      onKeyDown={(e) => {
                        if (isOwner && e.key === "Enter") {
                          e.currentTarget.blur();
                        }
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {hasChanges && (
                      <>
                        <button
                          onClick={() => setEditingContent(null)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-yellow-400 hover:text-yellow-300 hover:bg-yellow-400/10 rounded-md transition-colors font-medium"
                        >
                          <X className="w-4 h-4" />
                          Discard
                        </button>
                        <button
                          onClick={handleSaveContent}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-green-400 hover:text-green-300 hover:bg-green-400/10 rounded-md transition-colors font-medium"
                        >
                          <Check className="w-4 h-4" />
                          Save
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setIsPreviewMode(!isPreviewMode)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-md transition-colors"
                    >
                      {isPreviewMode ? (
                        <>
                          <Edit2 className="w-4 h-4" />
                          Raw
                        </>
                      ) : (
                        <>
                          <Eye className="w-4 h-4" />
                          Preview
                        </>
                      )}
                    </button>
                    {canTogglePromptVisibility && (
                      <button
                        onClick={() =>
                          handleTogglePromptPublic(
                            activePrompt.id,
                            !activePrompt.isPublic,
                          )
                        }
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-cyan-300 hover:text-cyan-200 hover:bg-cyan-500/10 rounded-md transition-colors"
                      >
                        <>
                          <Lock className="w-4 h-4" />
                          {activePrompt.isPublic
                            ? "Make Private"
                            : "Make Public"}
                        </>
                      </button>
                    )}
                    <button
                      onClick={() => handleCopyPrompt(activePrompt.content)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-md transition-colors"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-4 h-4 text-green-400" />
                          <span className="text-green-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy
                        </>
                      )}
                    </button>
                    {isOwner && (
                      <button
                        onClick={() => {
                          if (isConfirmingDelete) {
                            handleDeletePrompt(activePrompt.id);
                          } else {
                            setIsConfirmingDelete(true);
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-md transition-colors"
                      >
                        {isConfirmingDelete ? (
                          <>
                            <Check className="w-4 h-4" />
                            Confirm?
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Preview Content */}
                <div className="flex-1 p-8 overflow-y-auto flex flex-col">
                  <div className="bg-neutral-900 border border-neutral-800/60 rounded-xl p-6 text-neutral-300 text-[15px] leading-relaxed shadow-sm min-h-50 flex-1 flex flex-col">
                    {isPreviewMode ? (
                      <div className="prose prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {currentContent}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <textarea
                        key={`textarea-${activePrompt.id}`}
                        className="w-full flex-1 bg-transparent border-none outline-none resize-none"
                        value={currentContent}
                        readOnly={!isOwner}
                        onChange={(e) => {
                          if (isOwner) {
                            setEditingContent(e.target.value);
                          }
                        }}
                        placeholder={
                          isOwner
                            ? "Type your prompt here..."
                            : "Read-only content"
                        }
                      />
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-neutral-600 bg-[#141414]">
                <FileText className="w-12 h-12 mb-4 opacity-20" />
                <p>Select a file to preview</p>
              </div>
            )}
          </div>
        </SidebarLayout>
      </div>

      {/* Global Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-indigo-600 text-white px-4 py-2 rounded-md shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom-5 fade-in duration-200">
          <Check className="w-4 h-4" />
          {toastMessage}
        </div>
      )}
    </div>
  );
}

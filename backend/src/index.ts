import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

declare global {
  namespace Express {
    interface Request {
      isOwner?: boolean;
    }
  }
}

const readEnvValueFromDotEnv = (key: string): string | null => {
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return null;

    const envContent = fs.readFileSync(envPath, "utf8");
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = envContent.match(new RegExp(`^${escapedKey}=(.*)$`, "m"));
    if (!match) return null;
    return match[1].trim().replace(/^['"]|['"]$/g, "");
  } catch {
    return null;
  }
};

const getEnvValue = (key: string): string | null =>
  process.env[key] || readEnvValueFromDotEnv(key) || null;

const getSqlitePathFromDatabaseUrl = (databaseUrl: string | null): string | null => {
  if (!databaseUrl) return null;
  if (databaseUrl.startsWith("file:")) {
    return databaseUrl.slice(5);
  }
  return null;
};

const sqlitePath =
  getEnvValue("SQLITE_PATH") ||
  getSqlitePathFromDatabaseUrl(getEnvValue("DATABASE_URL")) ||
  "./dev.db";

const portValue = getEnvValue("PORT");
if (!portValue) {
  throw new Error(
    "PORT is required. Set PORT in backend/.env or environment variables.",
  );
}
const parsedPort = Number(portValue);
if (!Number.isFinite(parsedPort) || parsedPort <= 0) {
  throw new Error(`Invalid PORT value: ${portValue}`);
}
const port = parsedPort;

const ownerSecretKey = getEnvValue("OWNER_SECRET_KEY") || "mock-owner-token";

const app = express();
const adapter = new PrismaBetterSqlite3({ url: sqlitePath });
const prisma = new PrismaClient({ adapter });

// --- Mock Auth Middleware ---
// In a real app, this would be a robust JWT or session-based authentication.
// For now, we check for a simple "Authorization: Bearer <OWNER_SECRET_KEY>" header.
const isOwner = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${ownerSecretKey}`) {
    req.isOwner = true;
  } else {
    req.isOwner = false;
  }
  next();
};

const requireOwner = (req: Request, res: Response, next: NextFunction) => {
  if (!req.isOwner) {
    return res.status(403).json({ error: "Forbidden: Owner access required" });
  }
  next();
};

app.use(cors());
app.use(express.json());
app.use(isOwner); // Apply the auth check to all routes

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/auth/me", (req, res) => {
  res.json({ isOwner: Boolean(req.isOwner) });
});

// --- Folders API ---

app.get("/api/folders", async (req, res) => {
  try {
    const where = req.isOwner ? undefined : ({ isPublic: true } as any);
    const folders = await prisma.folder.findMany({
      where,
    });
    res.json(folders);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch folders" });
  }
});

app.post("/api/folders", requireOwner, async (req, res) => {
  try {
    const { name, type, parentId, isPublic } = req.body;
    let resolvedIsPublic = isPublic !== undefined ? Boolean(isPublic) : true;

    if (parentId) {
      const parentFolder = await prisma.folder.findUnique({
        where: { id: String(parentId) },
        select: { isPublic: true },
      });
      if (!parentFolder) {
        return res.status(404).json({ error: "Parent folder not found" });
      }
      if (!parentFolder.isPublic) {
        resolvedIsPublic = false;
      }
    }

    const data: {
      name: string;
      type: string;
      parentId: string | null;
      isPublic: boolean;
    } = {
      name,
      type: type ?? "folder",
      parentId: parentId ?? null,
      isPublic: resolvedIsPublic,
    };

    const folder = await prisma.folder.create({
      data,
    });
    res.json(folder);
  } catch (error) {
    res.status(500).json({ error: "Failed to create folder" });
  }
});

app.put("/api/folders/:id", requireOwner, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, parentId, isPublic } = req.body;
    const existingFolder = await prisma.folder.findUnique({
      where: { id: String(id) },
      select: { parentId: true },
    });
    if (!existingFolder) {
      return res.status(404).json({ error: "Folder not found" });
    }

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (parentId !== undefined) data.parentId = parentId;

    const effectiveParentId =
      parentId !== undefined ? (parentId ? String(parentId) : null) : existingFolder.parentId;
    let parentIsPublic = true;
    if (effectiveParentId) {
      const parentFolder = await prisma.folder.findUnique({
        where: { id: effectiveParentId },
        select: { isPublic: true },
      });
      if (!parentFolder) {
        return res.status(404).json({ error: "Parent folder not found" });
      }
      parentIsPublic = parentFolder.isPublic;
    }

    if (!parentIsPublic) {
      data.isPublic = false;
    } else if (isPublic !== undefined) {
      data.isPublic = Boolean(isPublic);
    }

    const folder = await prisma.folder.update({
      where: { id: String(id) },
      data,
    });
    res.json(folder);
  } catch (error) {
    res.status(500).json({ error: "Failed to update folder" });
  }
});

app.delete("/api/folders/:id", requireOwner, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.folder.delete({ where: { id: String(id) } });
    res.json({ message: "Folder deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete folder" });
  }
});

// --- Prompts API ---

app.get("/api/folders/:folderId/prompts", async (req, res) => {
  try {
    const folderId = req.params.folderId;
    const where: {
      folderId: string | null;
      isPublic?: boolean;
    } = {
      folderId: folderId === "uncategorized" ? null : String(folderId),
    };

    if (!req.isOwner) {
      where.isPublic = true;
    }

    const prompts = await prisma.prompt.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    res.json(prompts);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch prompts" });
  }
});

app.get("/api/prompts", async (req, res) => {
  try {
    const where = req.isOwner ? undefined : ({ isPublic: true } as any);
    const prompts = await prisma.prompt.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    res.json(prompts);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch prompts" });
  }
});

app.post("/api/prompts", requireOwner, async (req, res) => {
  try {
    const { name, content, folderId, isPublic } = req.body;
    let resolvedIsPublic = isPublic !== undefined ? Boolean(isPublic) : true;

    if (folderId) {
      const folder = await prisma.folder.findUnique({
        where: { id: String(folderId) },
        select: { isPublic: true },
      });
      if (!folder) {
        return res.status(404).json({ error: "Folder not found" });
      }
      if (!folder.isPublic) {
        resolvedIsPublic = false;
      }
    }

    const data: {
      name?: string | null;
      content: string;
      folderId: string | null;
      isPublic: boolean;
    } = {
      name,
      content,
      folderId: folderId ?? null,
      isPublic: resolvedIsPublic,
    };

    const prompt = await prisma.prompt.create({
      data,
    });
    res.json(prompt);
  } catch (error) {
    res.status(500).json({ error: "Failed to create prompt" });
  }
});

app.put("/api/prompts/:id", requireOwner, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, content, folderId, isPublic } = req.body;
    const existingPrompt = await prisma.prompt.findUnique({
      where: { id: String(id) },
      select: { folderId: true },
    });
    if (!existingPrompt) {
      return res.status(404).json({ error: "Prompt not found" });
    }

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (content !== undefined) data.content = content;
    if (folderId !== undefined) data.folderId = folderId;

    const effectiveFolderId =
      folderId !== undefined ? (folderId ? String(folderId) : null) : existingPrompt.folderId;
    let folderIsPublic = true;
    if (effectiveFolderId) {
      const folder = await prisma.folder.findUnique({
        where: { id: effectiveFolderId },
        select: { isPublic: true },
      });
      if (!folder) {
        return res.status(404).json({ error: "Folder not found" });
      }
      folderIsPublic = folder.isPublic;
    }

    if (!folderIsPublic) {
      data.isPublic = false;
    } else if (isPublic !== undefined) {
      data.isPublic = Boolean(isPublic);
    }

    const prompt = await prisma.prompt.update({
      where: { id: String(id) },
      data,
    });
    res.json(prompt);
  } catch (error) {
    res.status(500).json({ error: "Failed to update prompt" });
  }
});

app.delete("/api/prompts/:id", requireOwner, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.prompt.delete({ where: { id: String(id) } });
    res.json({ message: "Prompt deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete prompt" });
  }
});

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});

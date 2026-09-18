import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { getMcpDir, getToken } from "./config.js";
import { extractFigmaProject } from "./extractor.js";

function readJsonSafe(filePath, defaultValue = {}) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch (err) {
    console.error(`[dims-extract MCP] Warning: Failed to read ${filePath}:`, err.message);
  }
  return defaultValue;
}

export function loadProjectsRegistry(mcpRootDir) {
  const registry = {};
  const projectsDir = path.join(mcpRootDir, "projects");

  if (fs.existsSync(projectsDir)) {
    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory()) {
        const pSlug = ent.name;
        const pDir = path.join(projectsDir, pSlug);
        const metaPath = path.join(pDir, "metadata.json");
        const screensPath = path.join(pDir, "screens.json");

        if (fs.existsSync(screensPath) || fs.existsSync(metaPath)) {
          const meta = readJsonSafe(metaPath, { name: pSlug, slug: pSlug });
          const screens = readJsonSafe(screensPath, []);
          const screenDetails = readJsonSafe(path.join(pDir, "screen-details.json"), {});
          const components = readJsonSafe(path.join(pDir, "components.json"), []);
          const styles = readJsonSafe(path.join(pDir, "styles.json"), {});

          registry[pSlug] = {
            slug: pSlug,
            dir: pDir,
            metadata: meta,
            screens,
            screenDetails,
            components,
            styles,
          };
        }
      }
    }
  }

  return registry;
}

export function startMcpServer(customMcpDir) {
  const mcpRootDir = customMcpDir || getMcpDir();
  let projectsRegistry = loadProjectsRegistry(mcpRootDir);

  function resolveProject(projectSlug) {
    if (projectSlug && projectsRegistry[projectSlug]) {
      return projectsRegistry[projectSlug];
    }
    const slugs = Object.keys(projectsRegistry);
    if (slugs.length === 0) return null;

    if (projectSlug) {
      const found = slugs.find((s) => s.toLowerCase() === projectSlug.toLowerCase());
      if (found) return projectsRegistry[found];
    }

    const defaultSlug = slugs.includes("archiva") ? "archiva" : slugs[0];
    return projectsRegistry[defaultSlug];
  }

  const TOOLS = [
    {
      name: "list_projects",
      description: "List all imported Figma projects currently available in dims-extract MCP.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "import_figma_project",
      description: "Download, parse, and render 2x PNG assets for a new Figma project. Uses encrypted token from config if token parameter is omitted.",
      inputSchema: {
        type: "object",
        properties: {
          figma_url: {
            type: "string",
            description: "Figma design URL or File Key.",
          },
          token: {
            type: "string",
            description: "Optional Figma Personal Access Token. Defaults to stored encrypted token.",
          },
          project_name: {
            type: "string",
            description: "Optional custom name/slug for the project. Defaults to Figma file title.",
          },
        },
        required: ["figma_url"],
      },
    },
    {
      name: "list_screens",
      description: "List UI screens for a project, optionally filtered by role/section ('MEMBER TEAM', 'ADMIN TENANT', 'HEAD OF TEAM', 'LOGIN') or search keyword.",
      inputSchema: {
        type: "object",
        properties: {
          project: {
            type: "string",
            description: "Project slug. Defaults to active project.",
          },
          role: {
            type: "string",
            description: "Filter by role/section.",
          },
          search: {
            type: "string",
            description: "Search keyword matching title or role.",
          },
        },
      },
    },
    {
      name: "get_screen_details",
      description: "Get detailed UI structure of a screen including title, role, dimensions, breadcrumbs, modals, key texts, buttons, form inputs, and image path.",
      inputSchema: {
        type: "object",
        properties: {
          screen_id: {
            type: "string",
            description: "Figma node ID (e.g. '1:1040') or screen title keyword (e.g. 'dashboard', 'retention').",
          },
          project: {
            type: "string",
            description: "Project slug. Defaults to active project.",
          },
        },
        required: ["screen_id"],
      },
    },
    {
      name: "get_screen_image",
      description: "Get the 2x high-resolution PNG image of a screen as an absolute file path or base64 image block for vision analysis.",
      inputSchema: {
        type: "object",
        properties: {
          screen_id: {
            type: "string",
            description: "Figma node ID or screen title keyword.",
          },
          project: {
            type: "string",
            description: "Project slug.",
          },
          format: {
            type: "string",
            enum: ["path", "base64", "both"],
            description: "Return mode: 'path' (file path only), 'base64' (image block for vision inspection), or 'both'. Defaults to 'both'.",
          },
        },
        required: ["screen_id"],
      },
    },
    {
      name: "list_components",
      description: "List all master components and variants for a project (logos, document icons, list items, nav menus).",
      inputSchema: {
        type: "object",
        properties: {
          project: {
            type: "string",
            description: "Project slug.",
          },
          search: {
            type: "string",
            description: "Filter by component name.",
          },
        },
      },
    },
    {
      name: "get_design_tokens",
      description: "Get typography tokens, shadows/effects, and styles extracted from the Figma project.",
      inputSchema: {
        type: "object",
        properties: {
          project: {
            type: "string",
            description: "Project slug.",
          },
          type: {
            type: "string",
            enum: ["all", "TEXT", "EFFECT"],
            description: "Filter style type. Defaults to 'all'.",
          },
        },
      },
    },
    {
      name: "search_design",
      description: "Search across screens, modals, buttons, forms, and components across one or all Figma projects.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search keyword (e.g. 'upload', 'retention', 'modal', 'delete').",
          },
          project: {
            type: "string",
            description: "Optional project slug to restrict search. Omit to search all projects.",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "get_project_summary",
      description: "Get architecture and statistics for a specific project.",
      inputSchema: {
        type: "object",
        properties: {
          project: {
            type: "string",
            description: "Project slug.",
          },
        },
      },
    },
  ];

  function handleListProjects() {
    projectsRegistry = loadProjectsRegistry(mcpRootDir);
    const list = Object.values(projectsRegistry).map((p) => ({
      slug: p.slug,
      name: p.metadata?.name || p.slug,
      fileKey: p.metadata?.fileKey,
      version: p.metadata?.version,
      screenCount: p.screens?.length || 0,
      componentCount: p.components?.length || 0,
      lastModified: p.metadata?.lastModified,
      path: p.dir,
    }));

    return {
      content: [{ type: "text", text: JSON.stringify(list, null, 2) }],
    };
  }

  async function handleImportProject(args) {
    const { figma_url, token, project_name } = args;
    const activeToken = token || getToken();

    if (!activeToken) {
      return {
        content: [
          {
            type: "text",
            text: "Error: Figma token not found. Please provide 'token' argument or run 'dims-extract auth <token>' to store it securely.",
          },
        ],
        isError: true,
      };
    }

    try {
      const result = await extractFigmaProject({
        fileKeyOrUrl: figma_url,
        token: activeToken,
        projectSlug: project_name,
        mcpRootDir,
        onProgress: (msg) => console.error(msg),
      });

      projectsRegistry = loadProjectsRegistry(mcpRootDir);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: `Successfully imported project "${result.name}" (${result.project})`,
                details: result,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Import failed: ${err.message}` }],
        isError: true,
      };
    }
  }

  function handleListScreens(args = {}) {
    const prj = resolveProject(args.project);
    if (!prj) {
      return {
        content: [{ type: "text", text: "No projects found. Import one with 'dims-extract add <url>' or tool 'import_figma_project'." }],
        isError: true,
      };
    }

    let list = prj.screens;
    if (args.role) {
      const r = args.role.toUpperCase().trim();
      list = list.filter((s) => s.role && s.role.toUpperCase().includes(r));
    }

    if (args.search) {
      const q = args.search.toLowerCase().trim();
      list = list.filter(
        (s) =>
          (s.title && s.title.toLowerCase().includes(q)) ||
          (s.role && s.role.toLowerCase().includes(q)) ||
          (s.id && s.id.includes(q))
      );
    }

    const formatted = list.map((s) => ({
      id: s.id,
      project: prj.slug,
      role: s.role,
      title: s.title,
      dimensions: `${s.dimensions.width}x${s.dimensions.height}`,
      imagePath: path.join(prj.dir, s.imagePath),
    }));

    return { content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }] };
  }

  function findScreenInProject(prj, screenIdOrQuery) {
    if (!prj || !screenIdOrQuery) return null;
    const q = screenIdOrQuery.toLowerCase().trim();

    if (prj.screenDetails[screenIdOrQuery]) return prj.screenDetails[screenIdOrQuery];

    const match = prj.screens.find(
      (s) =>
        s.id === screenIdOrQuery ||
        s.title.toLowerCase() === q ||
        s.title.toLowerCase().includes(q) ||
        (s.imagePath && s.imagePath.toLowerCase().includes(q))
    );

    if (match && prj.screenDetails[match.id]) {
      return prj.screenDetails[match.id];
    }

    return match || null;
  }

  function handleGetScreenDetails(args = {}) {
    const prj = resolveProject(args.project);
    if (!prj) {
      return { content: [{ type: "text", text: "Project not found." }], isError: true };
    }

    const scr = findScreenInProject(prj, args.screen_id);
    if (!scr) {
      return {
        content: [{ type: "text", text: `Screen "${args.screen_id}" not found in project "${prj.slug}". Call list_screens to see available screens.` }],
        isError: true,
      };
    }

    const detail = prj.screenDetails[scr.id] || scr;
    const absoluteImagePath = path.join(prj.dir, detail.imagePath);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              project: prj.slug,
              ...detail,
              absoluteImagePath,
              imageExists: fs.existsSync(absoluteImagePath),
            },
            null,
            2
          ),
        },
      ],
    };
  }

  function handleGetScreenImage(args = {}) {
    const prj = resolveProject(args.project);
    if (!prj) {
      return { content: [{ type: "text", text: "Project not found." }], isError: true };
    }

    const scr = findScreenInProject(prj, args.screen_id);
    if (!scr) {
      return { content: [{ type: "text", text: `Screen "${args.screen_id}" not found in project "${prj.slug}".` }], isError: true };
    }

    const absoluteImagePath = path.join(prj.dir, scr.imagePath);
    if (!fs.existsSync(absoluteImagePath)) {
      return { content: [{ type: "text", text: `Image not found at ${absoluteImagePath}` }], isError: true };
    }

    const format = args.format || "both";
    const content = [];

    if (format === "base64" || format === "both") {
      const base64Data = fs.readFileSync(absoluteImagePath).toString("base64");
      content.push({
        type: "image",
        data: base64Data,
        mimeType: "image/png",
      });
    }

    if (format === "path" || format === "both") {
      content.push({
        type: "text",
        text: `Project: ${prj.slug}\nScreen: ${scr.title} (${scr.role})\nDimensions: ${scr.dimensions?.width}x${scr.dimensions?.height}px\nPath: ${absoluteImagePath}`,
      });
    }

    return { content };
  }

  function handleListComponents(args = {}) {
    const prj = resolveProject(args.project);
    if (!prj) {
      return { content: [{ type: "text", text: "Project not found." }], isError: true };
    }

    let list = prj.components;
    if (args.search) {
      const s = args.search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(s));
    }

    const formatted = list.map((c) => ({
      id: c.id,
      project: prj.slug,
      name: c.name,
      type: c.type,
      dimensions: `${c.dimensions.width}x${c.dimensions.height}`,
      imagePath: path.join(prj.dir, c.imagePath),
      variants: (c.variants || []).map((v) => ({
        id: v.id,
        name: v.name,
        imagePath: path.join(prj.dir, v.imagePath),
      })),
    }));

    return { content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }] };
  }

  function handleGetDesignTokens(args = {}) {
    const prj = resolveProject(args.project);
    if (!prj) {
      return { content: [{ type: "text", text: "Project not found." }], isError: true };
    }

    const filterType = args.type || "all";
    const filtered = {};
    for (const [id, style] of Object.entries(prj.styles)) {
      if (filterType === "all" || style.styleType === filterType) {
        filtered[id] = style;
      }
    }

    return { content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }] };
  }

  function handleSearchDesign(args = {}) {
    const q = (args.query || "").toLowerCase().trim();
    if (!q) {
      return { content: [{ type: "text", text: "Please provide a query." }], isError: true };
    }

    const targetProjects = args.project ? [resolveProject(args.project)].filter(Boolean) : Object.values(projectsRegistry);

    const matchedScreens = [];
    const matchedComponents = [];

    for (const prj of targetProjects) {
      for (const [id, s] of Object.entries(prj.screenDetails)) {
        const textCorpus = [
          s.title,
          s.role,
          s.breadcrumb,
          ...(s.keyTexts || []),
          ...(s.buttons || []),
          ...(s.inputs || []),
          ...(s.modals || []).flatMap((m) => m.texts || []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (textCorpus.includes(q)) {
          matchedScreens.push({
            project: prj.slug,
            id: s.id,
            role: s.role,
            title: s.title,
            matchedSnippet: (s.keyTexts || []).find((t) => t.toLowerCase().includes(q)) || s.title,
            imagePath: path.join(prj.dir, s.imagePath),
          });
        }
      }

      for (const c of prj.components) {
        if (
          c.name.toLowerCase().includes(q) ||
          (c.variants || []).some((v) => v.name.toLowerCase().includes(q))
        ) {
          matchedComponents.push({
            project: prj.slug,
            id: c.id,
            name: c.name,
            variants: c.variants?.map((v) => v.name),
            imagePath: path.join(prj.dir, c.imagePath),
          });
        }
      }
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              query: args.query,
              totalScreensFound: matchedScreens.length,
              screens: matchedScreens,
              totalComponentsFound: matchedComponents.length,
              components: matchedComponents,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  function handleGetProjectSummary(args = {}) {
    const prj = resolveProject(args.project);
    if (!prj) {
      return { content: [{ type: "text", text: "Project not found." }], isError: true };
    }

    const summary = {
      project: prj.slug,
      name: prj.metadata?.name || prj.slug,
      fileKey: prj.metadata?.fileKey,
      version: prj.metadata?.version,
      lastModified: prj.metadata?.lastModified,
      totalScreens: prj.screens.length,
      rolesCovered: Array.from(new Set(prj.screens.map((s) => s.role))),
      totalComponents: prj.components.length,
      totalStyles: Object.keys(prj.styles).length,
      path: prj.dir,
    };

    return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
  }

  async function handleRequest(req) {
    const { method, params } = req;

    switch (method) {
      case "initialize":
        return {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: "dims-extract-mcp", version: "1.0.0" },
        };

      case "notifications/initialized":
        return null;

      case "ping":
        return {};

      case "tools/list":
        return { tools: TOOLS };

      case "tools/call": {
        const { name, arguments: args = {} } = params || {};
        switch (name) {
          case "list_projects":
            return handleListProjects();
          case "import_figma_project":
            return await handleImportProject(args);
          case "list_screens":
            return handleListScreens(args);
          case "get_screen_details":
            return handleGetScreenDetails(args);
          case "get_screen_image":
            return handleGetScreenImage(args);
          case "list_components":
            return handleListComponents(args);
          case "get_design_tokens":
            return handleGetDesignTokens(args);
          case "search_design":
            return handleSearchDesign(args);
          case "get_project_summary":
            return handleGetProjectSummary(args);
          default:
            return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
        }
      }

      case "resources/list": {
        const resList = [
          {
            uri: "figma://projects",
            name: "All Figma Projects",
            mimeType: "application/json",
          },
        ];
        for (const p of Object.values(projectsRegistry)) {
          resList.push({
            uri: `figma://${p.slug}/screens`,
            name: `${p.metadata?.name || p.slug} Screens`,
            mimeType: "application/json",
          });
        }
        return { resources: resList };
      }

      case "resources/read": {
        const uri = params?.uri;
        if (uri === "figma://projects") {
          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(Object.keys(projectsRegistry), null, 2),
              },
            ],
          };
        }
        const match = uri?.match(/^figma:\/\/([^/]+)\/(screens|components|styles|metadata)$/);
        if (match) {
          const [, pSlug, resType] = match;
          const prj = projectsRegistry[pSlug];
          if (prj && prj[resType]) {
            return {
              contents: [
                {
                  uri,
                  mimeType: "application/json",
                  text: JSON.stringify(prj[resType], null, 2),
                },
              ],
            };
          }
        }
        throw { code: -32602, message: `Resource not found: ${uri}` };
      }

      default:
        throw { code: -32601, message: `Method not supported: ${method}` };
    }
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const req = JSON.parse(trimmed);

      if (typeof req.id === "undefined") {
        await handleRequest(req);
        return;
      }

      try {
        const result = await handleRequest(req);
        const res = { jsonrpc: "2.0", id: req.id, result };
        process.stdout.write(JSON.stringify(res) + "\n");
      } catch (err) {
        const res = {
          jsonrpc: "2.0",
          id: req.id,
          error: { code: err.code || -32000, message: err.message || String(err) },
        };
        process.stdout.write(JSON.stringify(res) + "\n");
      }
    } catch (parseErr) {
      const res = { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error: Invalid JSON" } };
      process.stdout.write(JSON.stringify(res) + "\n");
    }
  });

  console.error(`[dims-extract MCP] Started successfully with ${Object.keys(projectsRegistry).length} project(s) from ${mcpRootDir}`);
}

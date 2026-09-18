import fs from "node:fs";
import path from "node:path";

export function extractFileKey(input) {
  if (!input) return null;
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/figma\.com\/(?:design|file)\/([a-zA-Z0-9_-]+)/i);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }
  if (/^[a-zA-Z0-9_-]{15,40}$/.test(trimmed)) {
    return trimmed;
  }
  return trimmed;
}

export function slugify(text) {
  return (text || "unnamed")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .trim() || "project";
}

function extractAllTexts(node) {
  let texts = [];
  if (node.type === "TEXT" && node.characters) {
    const t = node.characters.trim().replace(/\s+/g, " ");
    if (t) texts.push(t);
  }
  if (node.children) {
    for (const c of node.children) {
      texts = texts.concat(extractAllTexts(c));
    }
  }
  return texts;
}

function findElements(node, predicate) {
  let matched = [];
  if (predicate(node)) matched.push(node);
  if (node.children) {
    for (const c of node.children) {
      matched = matched.concat(findElements(c, predicate));
    }
  }
  return matched;
}

export async function extractFigmaProject({ fileKeyOrUrl, token, projectSlug, mcpRootDir, onProgress }) {
  const fileKey = extractFileKey(fileKeyOrUrl);
  if (!fileKey) {
    throw new Error("Invalid Figma URL or File Key. Expected a URL like https://www.figma.com/design/... or a valid key.");
  }
  if (!token) {
    throw new Error("Figma token is required. Run 'dims-extract auth <token>' or set the FIGMA_TOKEN environment variable.");
  }

  const log = (msg) => {
    if (onProgress) onProgress(msg);
    else console.log(msg);
  };

  log(`[dims-extract] Fetching Figma file: ${fileKey}...`);
  const res = await fetch(`https://api.figma.com/v1/files/${fileKey}`, {
    headers: { "X-Figma-Token": token },
  });

  if (!res.ok) {
    if (res.status === 403) {
      throw new Error("Figma API error (403 Forbidden): Invalid or expired Figma Personal Access Token.");
    }
    if (res.status === 404) {
      throw new Error(`Figma file not found (404): Key "${fileKey}" does not exist or is inaccessible.`);
    }
    const errText = await res.text();
    throw new Error(`Figma API error (${res.status} ${res.statusText}): ${errText}`);
  }

  const data = await res.json();
  const slug = projectSlug ? slugify(projectSlug) : slugify(data.name);
  const outDir = path.join(mcpRootDir, "projects", slug);

  log(`[dims-extract] Target project: "${data.name}" -> ${outDir}`);
  fs.mkdirSync(outDir, { recursive: true });

  // 1. Raw JSON & Metadata
  fs.writeFileSync(path.join(outDir, "raw-file.json"), JSON.stringify(data, null, 2), "utf-8");

  const metadata = {
    name: data.name,
    fileKey,
    slug,
    role: data.role,
    lastModified: data.lastModified,
    editorType: data.editorType,
    thumbnailUrl: data.thumbnailUrl,
    version: data.version,
    extractedAt: new Date().toISOString(),
    componentCount: Object.keys(data.components || {}).length,
    componentSetCount: Object.keys(data.componentSets || {}).length,
    styleCount: Object.keys(data.styles || {}).length,
  };
  fs.writeFileSync(path.join(outDir, "metadata.json"), JSON.stringify(metadata, null, 2), "utf-8");
  fs.writeFileSync(path.join(outDir, "styles.json"), JSON.stringify(data.styles || {}, null, 2), "utf-8");

  // 2. Discover Screens and Components
  const itemsToExport = [];
  const screensCatalog = [];
  const componentsCatalog = [];
  const detailedScreens = {};

  for (const page of data.document?.children || []) {
    const pageNameLower = (page.name || "").toLowerCase();
    const isComponentPage = pageNameLower.includes("component") || pageNameLower.includes("design system");
    const isCoverPage = pageNameLower.includes("cover");

    // A. Cover Page
    if (isCoverPage) {
      for (const child of page.children || []) {
        itemsToExport.push({
          id: child.id,
          name: child.name,
          categoryDir: "cover",
          fileName: `cover_${child.id.replace(":", "_")}.png`,
        });
      }
      continue;
    }

    // B. Component Page
    if (isComponentPage) {
      for (const comp of page.children || []) {
        const compFolder = comp.name.replace(/[^a-zA-Z0-9_-]+/g, "_");
        itemsToExport.push({
          id: comp.id,
          name: comp.name,
          categoryDir: "components",
          fileName: `${compFolder}.png`,
        });

        const compEntry = {
          id: comp.id,
          name: comp.name,
          type: comp.type,
          dimensions: {
            width: comp.absoluteBoundingBox?.width || 0,
            height: comp.absoluteBoundingBox?.height || 0,
          },
          imagePath: `images/components/${compFolder}.png`,
          variants: (comp.children || []).map((v) => ({
            id: v.id,
            name: v.name,
            dimensions: {
              width: v.absoluteBoundingBox?.width || 0,
              height: v.absoluteBoundingBox?.height || 0,
            },
            imagePath: `images/components/${compFolder}/${v.name.replace(/[^a-zA-Z0-9_=-]+/g, "_")}.png`,
          })),
        };
        componentsCatalog.push(compEntry);

        // Individual variants
        if (comp.children) {
          for (const v of comp.children) {
            itemsToExport.push({
              id: v.id,
              name: v.name,
              categoryDir: path.join("components", compFolder),
              fileName: `${v.name.replace(/[^a-zA-Z0-9_=-]+/g, "_")}.png`,
            });
          }
        }
      }
      continue;
    }

    // C. Regular Pages / UI Flow
    const pageSlug = slugify(page.name);

    for (const child of page.children || []) {
      if (child.type === "SECTION") {
        const sectionSlug = slugify(child.name);
        itemsToExport.push({
          id: child.id,
          name: child.name,
          categoryDir: "sections",
          fileName: `section_${sectionSlug}.png`,
        });

        let screenIndex = 1;
        for (const scr of child.children || []) {
          const titleSlug = `${String(screenIndex++).padStart(2, "0")}_${slugify(scr.name)}_${scr.id.replace(":", "_")}`;
          const fileName = `${titleSlug}.png`;
          const imageRelPath = `images/screens/${sectionSlug}/${fileName}`;

          itemsToExport.push({
            id: scr.id,
            name: scr.name,
            categoryDir: path.join("screens", sectionSlug),
            fileName,
          });

          screensCatalog.push({
            id: scr.id,
            role: child.name,
            title: scr.name.toUpperCase(),
            type: scr.type,
            dimensions: {
              width: scr.absoluteBoundingBox?.width || 0,
              height: scr.absoluteBoundingBox?.height || 0,
            },
            imagePath: imageRelPath,
          });

          indexScreenDetail(scr, child.name, imageRelPath, detailedScreens);
        }
      } else if (
        child.type === "FRAME" &&
        (child.absoluteBoundingBox?.width || 0) >= 200 &&
        (child.absoluteBoundingBox?.height || 0) >= 200
      ) {
        const titleSlug = `${slugify(child.name)}_${child.id.replace(":", "_")}`;
        const fileName = `${titleSlug}.png`;
        const imageRelPath = `images/screens/${pageSlug}/${fileName}`;

        itemsToExport.push({
          id: child.id,
          name: child.name,
          categoryDir: path.join("screens", pageSlug),
          fileName,
        });

        screensCatalog.push({
          id: child.id,
          role: page.name,
          title: child.name.toUpperCase(),
          type: child.type,
          dimensions: {
            width: child.absoluteBoundingBox?.width || 0,
            height: child.absoluteBoundingBox?.height || 0,
          },
          imagePath: imageRelPath,
        });

        indexScreenDetail(child, page.name, imageRelPath, detailedScreens);
      }
    }
  }

  function indexScreenDetail(node, role, imageRelPath, store) {
    const allTexts = Array.from(new Set(extractAllTexts(node)));
    const modalNodes = findElements(node, (n) => (n.name || "").toLowerCase().includes("dialog") || (n.name || "").toLowerCase().includes("modal"));
    const modals = modalNodes.map((m) => ({
      name: m.name,
      texts: Array.from(new Set(extractAllTexts(m))),
    })).filter((m) => m.texts.length > 0);

    const buttonNodes = findElements(node, (n) => (n.name || "").toLowerCase().includes("button"));
    const buttons = Array.from(new Set(buttonNodes.flatMap((b) => extractAllTexts(b)).filter((t) => t.length > 0 && t.length < 30)));

    const inputNodes = findElements(node, (n) => (n.name || "").toLowerCase().includes("field") || (n.name || "").toLowerCase().includes("input"));
    const inputs = Array.from(new Set(inputNodes.flatMap((i) => extractAllTexts(i)).filter((t) => t.length > 0 && t.length < 40)));

    const breadcrumbNodes = findElements(node, (n) => (n.name || "").toLowerCase().includes("breadcrumb"));
    const breadcrumb = Array.from(new Set(breadcrumbNodes.flatMap((b) => extractAllTexts(b)))).join(" / ");

    store[node.id] = {
      id: node.id,
      role,
      title: node.name.toUpperCase(),
      type: node.type,
      dimensions: {
        width: node.absoluteBoundingBox?.width || 0,
        height: node.absoluteBoundingBox?.height || 0,
      },
      imagePath: imageRelPath,
      breadcrumb: breadcrumb || null,
      keyTexts: allTexts.slice(0, 35),
      modals: modals.slice(0, 4),
      buttons: buttons.slice(0, 15),
      inputs: inputs.slice(0, 15),
    };
  }

  fs.writeFileSync(path.join(outDir, "screens.json"), JSON.stringify(screensCatalog, null, 2), "utf-8");
  fs.writeFileSync(path.join(outDir, "screen-details.json"), JSON.stringify(detailedScreens, null, 2), "utf-8");
  fs.writeFileSync(path.join(outDir, "components.json"), JSON.stringify(componentsCatalog, null, 2), "utf-8");

  // 3. Batch render PNG images (2x resolution)
  log(`[dims-extract] Rendering ${itemsToExport.length} assets at 2x resolution...`);
  const BATCH_SIZE = 30;
  let downloadedCount = 0;

  for (let i = 0; i < itemsToExport.length; i += BATCH_SIZE) {
    const batch = itemsToExport.slice(i, i + BATCH_SIZE);
    const ids = batch.map((item) => item.id).join(",");
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(itemsToExport.length / BATCH_SIZE);

    try {
      const imgRes = await fetch(
        `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(ids)}&format=png&scale=2`,
        {
          headers: { "X-Figma-Token": token },
        }
      );

      if (!imgRes.ok) {
        log(`[dims-extract] Warning: Batch ${batchNum} render failed: ${imgRes.status} ${imgRes.statusText}`);
        continue;
      }

      const imgData = await imgRes.json();
      const imagesMap = imgData.images || {};

      for (const item of batch) {
        const imgUrl = imagesMap[item.id];
        if (!imgUrl) continue;

        const targetDir = path.join(outDir, "images", item.categoryDir);
        fs.mkdirSync(targetDir, { recursive: true });
        const targetPath = path.join(targetDir, item.fileName);

        const dlRes = await fetch(imgUrl);
        if (dlRes.ok) {
          const buffer = Buffer.from(await dlRes.arrayBuffer());
          fs.writeFileSync(targetPath, buffer);
          downloadedCount++;
        }
      }
      log(`  -> Rendered batch ${batchNum}/${totalBatches}`);
    } catch (err) {
      log(`[dims-extract] Error in batch ${batchNum}: ${err.message}`);
    }
  }

  // 4. Generate README.md for the project
  const readmeContent = `# ${data.name} - Figma Design Export

- **Project Slug**: \`${slug}\`
- **File Key**: \`${fileKey}\`
- **Version**: ${data.version}
- **Screens**: ${screensCatalog.length}
- **Components**: ${componentsCatalog.length}
- **Downloaded Images**: ${downloadedCount}
- **Extracted At**: ${new Date().toISOString()}

---

## Screens Catalog

| No | Section / Role | Screen Name | Dimensions | PNG Image |
|---|---|---|---|---|
${screensCatalog.map((s, i) => `| ${i + 1} | \`${s.role}\` | **${s.title}** | ${s.dimensions.width}x${s.dimensions.height} | [${s.imagePath}](${s.imagePath}) |`).join("\n")}
`;
  fs.writeFileSync(path.join(outDir, "README.md"), readmeContent, "utf-8");

  log(`[dims-extract] Success! Extracted ${screensCatalog.length} screens and ${downloadedCount} images to ${outDir}`);

  return {
    success: true,
    project: slug,
    name: data.name,
    fileKey,
    screenCount: screensCatalog.length,
    componentCount: componentsCatalog.length,
    imageCount: downloadedCount,
    outputDir: outDir,
  };
}

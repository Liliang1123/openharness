import * as fs from "node:fs";
import * as path from "node:path";
import type { Skill, SkillMetadata } from "./types";

export function resolveSkillPath(skillName: string): string {
  const paths = [
    path.join(process.cwd(), "skills", skillName, "SKILL.md"),
    path.join(process.env.HOME || "", ".openharness", "skills", skillName, "SKILL.md")
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Skill ${skillName} not found`);
}

export function parseYamlSimple(yamlStr: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = yamlStr.split(/\r?\n/);
  
  let currentKey = "";
  let inParameters = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const indent = line.search(/\S/);
    if (inParameters && indent === 0) {
      inParameters = false;
    }

    if (trimmed.startsWith("- ")) {
      const item = trimmed.substring(2).trim().replace(/^['"]|['"]$/g, "");
      if (currentKey && Array.isArray(result[currentKey])) {
        result[currentKey].push(item);
      }
      continue;
    }

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;

    const key = trimmed.substring(0, colonIndex).trim();
    let val = trimmed.substring(colonIndex + 1).trim();

    val = val.replace(/^['"]|['"]$/g, "");

    if (key === "parameters") {
      inParameters = true;
      result[key] = {};
      currentKey = key;
      continue;
    }

    if (inParameters) {
      const parsedVal = val === "true" ? true : val === "false" ? false : val;
      result.parameters[key] = parsedVal;
      continue;
    }

    currentKey = key;

    if (val === "true") {
      result[key] = true;
    } else if (val === "false") {
      result[key] = false;
    } else if (val === "") {
      result[key] = [];
    } else if (val.startsWith("[") && val.endsWith("]")) {
      result[key] = val.slice(1, -1).split(",").map(s => s.trim().replace(/^['"]|['"]$/g, ""));
    } else {
      result[key] = val;
    }
  }

  return result;
}

export function parseSkillMarkdown(filePath: string): Skill {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File does not exist: ${filePath}`);
  }
  const fileContent = fs.readFileSync(filePath, "utf-8");
  if (!fileContent.startsWith("---")) {
    throw new Error(`Invalid skill format: ${filePath} (Missing YAML Frontmatter)`);
  }

  const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)/);
  if (!match) {
    throw new Error(`Parse error: Frontmatter delimiters mismatch in ${filePath}`);
  }

  const yamlStr = match[1];
  const content = match[2].trim();
  const metadata = parseYamlSimple(yamlStr) as SkillMetadata;

  return {
    metadata,
    content,
    sourcePath: filePath
  };
}

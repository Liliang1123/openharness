import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseSkillMarkdown } from "../../src/skills/loader";

describe("parseSkillMarkdown", () => {
  const testSkillPath = path.join("/tmp", "test-loader-skill.md");

  beforeAll(() => {
    const content = [
      "---",
      "name: document-parser",
      "description: Extends document parsing capabilities",
      "version: 1.0.0",
      "fork_agent: false",
      "tools_required:",
      "  - read_file",
      "  - write_file",
      "parameters:",
      "  param1: true",
      "  param2: value2",
      "---",
      "# Steps for document parser",
      "1. Find file",
      "2. Read file"
    ].join("\n");
    fs.writeFileSync(testSkillPath, content, "utf-8");
  });

  afterAll(() => {
    if (fs.existsSync(testSkillPath)) {
      fs.unlinkSync(testSkillPath);
    }
  });

  it("successfully parses frontmatter yaml and body content", () => {
    const skill = parseSkillMarkdown(testSkillPath);
    expect(skill.metadata.name).toBe("document-parser");
    expect(skill.metadata.description).toBe("Extends document parsing capabilities");
    expect(skill.metadata.version).toBe("1.0.0");
    expect(skill.metadata.fork_agent).toBe(false);
    expect(skill.metadata.tools_required).toEqual(["read_file", "write_file"]);
    expect(skill.metadata.parameters).toEqual({ param1: true, param2: "value2" });
    expect(skill.content).toContain("# Steps for document parser");
  });

  it("throws error when file is missing frontmatter headers", () => {
    const invalidPath = path.join("/tmp", "test-loader-invalid.md");
    fs.writeFileSync(invalidPath, "some basic text content without boundaries", "utf-8");
    expect(() => parseSkillMarkdown(invalidPath)).toThrow();
    fs.unlinkSync(invalidPath);
  });
});

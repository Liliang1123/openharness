import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  QualificationReportSchema,
  type QualificationReport
} from "@openharness/shared-schema";
import { evaluateGateCProviderQualification, type ProviderReportInput } from "./gateCProviderPolicy";

interface CliIo {
  stdout(line: string): void;
  stderr(line: string): void;
}

interface ParsedArguments {
  projectRoot: string;
  requiredReport: string;
  advisoryReports: string[];
  output: string;
  generatedAt: string;
}

class CliError extends Error {
  constructor(readonly errorClass: string) {
    super(errorClass);
  }
}

const singletonFlags: ReadonlyMap<string, keyof Omit<ParsedArguments, "advisoryReports">> = new Map([
  ["--project-root", "projectRoot"],
  ["--required-report", "requiredReport"],
  ["--output", "output"],
  ["--generated-at", "generatedAt"]
] as const);

function parseArguments(args: string[]): ParsedArguments {
  const normalizedArgs = args[0] === "--" ? args.slice(1) : args;
  const values: Partial<Omit<ParsedArguments, "advisoryReports">> = {};
  const advisoryReports: string[] = [];
  for (let index = 0; index < normalizedArgs.length; index += 2) {
    const flag = normalizedArgs[index];
    const value = normalizedArgs[index + 1];
    if (!flag || !value || value.startsWith("--")) throw new CliError("invalid_arguments");
    if (flag === "--advisory-report") {
      advisoryReports.push(value);
      continue;
    }
    const key = singletonFlags.get(flag);
    if (!key || values[key] !== undefined) throw new CliError("invalid_arguments");
    values[key] = value;
  }
  if (!values.projectRoot || !values.requiredReport || !values.output || !values.generatedAt) {
    throw new CliError("invalid_arguments");
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(values.generatedAt)
    || Number.isNaN(Date.parse(values.generatedAt))) {
    throw new CliError("invalid_generated_at");
  }
  return { ...values as Omit<ParsedArguments, "advisoryReports">, advisoryReports };
}

function isInside(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === "" || (pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`));
}

function canonicalProjectRoot(projectRoot: string): string {
  try {
    const root = realpathSync(resolve(projectRoot));
    if (!statSync(root).isDirectory()) throw new CliError("invalid_project_root");
    return root;
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError("invalid_project_root");
  }
}

function resolveInput(root: string, value: string): { absolute: string; projectRelative: string } {
  try {
    const candidate = realpathSync(resolve(root, value));
    if (!isInside(root, candidate) || !statSync(candidate).isFile()) throw new CliError("invalid_input_path");
    return {
      absolute: candidate,
      projectRelative: relative(root, candidate).split(sep).join("/")
    };
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError("invalid_input_path");
  }
}

function resolveOutput(root: string, value: string): string {
  try {
    const candidate = resolve(root, value);
    const canonicalParent = realpathSync(dirname(candidate));
    const canonicalCandidate = resolve(canonicalParent, basename(candidate));
    if (!isInside(root, canonicalCandidate)) throw new CliError("invalid_output_path");
    return canonicalCandidate;
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError("invalid_output_path");
  }
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function readReport(absolute: string, projectRelative: string): ProviderReportInput {
  try {
    const bytes = readFileSync(absolute);
    const report = QualificationReportSchema.parse(JSON.parse(bytes.toString("utf8"))) as QualificationReport;
    return { path: projectRelative, sha256: sha256(bytes), report };
  } catch {
    throw new CliError("report_parse_error");
  }
}

export function runGateCProviderReconciliation(args: string[], io: CliIo = {
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line)
}): number {
  try {
    const parsed = parseArguments(args);
    const root = canonicalProjectRoot(parsed.projectRoot);
    const outputPath = resolveOutput(root, parsed.output);
    if (existsSync(outputPath)) throw new CliError("output_exists");

    const requiredPath = resolveInput(root, parsed.requiredReport);
    const advisoryPaths = parsed.advisoryReports.map((path) => resolveInput(root, path));
    const required = readReport(requiredPath.absolute, requiredPath.projectRelative);
    const advisory = advisoryPaths.map((path) => readReport(path.absolute, path.projectRelative));
    const decision = evaluateGateCProviderQualification({
      generatedAt: parsed.generatedAt,
      required,
      advisory
    });
    const bytes = `${JSON.stringify(decision, null, 2)}\n`;

    try {
      writeFileSync(outputPath, bytes, { encoding: "utf8", flag: "wx", mode: 0o600 });
    } catch {
      throw new CliError("output_write_error");
    }

    if (decision.result === "blocked") {
      io.stderr(`result=blocked policy=openai-compatible-required-v1 blockerCount=${decision.blockers.length} blockerClasses=${decision.blockers.join(",")}`);
      return 3;
    }
    io.stdout(`result=pass policy=openai-compatible-required-v1 output=${basename(outputPath)} sha256=${sha256(bytes)}`);
    return 0;
  } catch (error) {
    const errorClass = error instanceof CliError ? error.errorClass : "unexpected_error";
    io.stderr(`preflight_error class=${errorClass}`);
    return 2;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  process.exitCode = runGateCProviderReconciliation(process.argv.slice(2));
}

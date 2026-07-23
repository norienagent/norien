export { ToolError, isToolError } from './errors.js';
export type { ToolErrorCode, ToolErrorDetail } from './errors.js';

export {
  TOOL_CATEGORIES,
  TOOL_MANIFEST_FILENAME,
  TOOL_RUNTIMES,
  TOOL_MANIFEST_SCHEMA,
  normalizeEnvironment,
  validateToolManifest,
} from './manifest.js';
export type { ToolManifest, ToolRuntime } from './manifest.js';

export { validateAgainstSchema } from './schema-validator.js';
export type { JsonSchema, ValidationIssue, ValidationResult } from './schema-validator.js';

export { executableCandidates, needsShell, resolveBinary, spawnJson } from './exec.js';
export type { ResolvedBinary, SpawnJsonResult } from './exec.js';

export { fetchSource, parseSource } from './source.js';
export type { FetchResult, GitSource } from './source.js';

export { ToolInstaller } from './installer.js';
export type { InstalledTool } from './installer.js';

export { ToolExecutor } from './executor.js';
export type { ToolExecutionOptions, ToolExecutionResult } from './executor.js';

export { generateToolDoc } from './docs.js';
export type { ToolDocOptions } from './docs.js';

export {
  ENV_EXAMPLE_FILENAME,
  TOOLS_DIRNAME,
  TOOLS_LOCKFILE,
  TOOL_METADATA_FILENAME,
  readInstalledToolManifest,
  readToolsLockfile,
  toolDir,
  toolsDir,
  toolsLockfilePath,
  writeToolsLockfile,
} from './workspace.js';
export type { ToolLockEntry, ToolLockfile, ToolSource } from './workspace.js';

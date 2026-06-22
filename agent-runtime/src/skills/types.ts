export interface SkillMetadata {
  name: string;
  description: string;
  version: string;
  tools_required: string[];
  parameters: Record<string, any>;
  tags?: string[];
  category?: string;
  author?: string;
  fork_agent?: boolean;
  subagent_model?: string;
  forbidden_tools?: string[];
  encrypted?: boolean;
  brand_id?: string;
  license_key?: string;
}

export interface Skill {
  metadata: SkillMetadata;
  content: string; // Markdown 步骤主体
  sourcePath: string;
}

export interface PendingInjection {
  skillName: string;
  expandedContent: string;
  task: string;
}

export interface ProviderMessageCapabilities {
  supportsSyntheticAssistantInjection: boolean;
  requiresLastUserMessage: boolean;
  requiresToolResultAdjacency: boolean;
  supportsParallelToolResults: boolean;
}

export type AssistantToolRuntime = {
  runtimeModelHasVision: boolean;
};

export type AssistantToolDefinition = {
  id: string;
  key: string;
  description: string;
};

export type AssistantToolModule = {
  key: string;
  description: string;
  createTool: (runtime: AssistantToolRuntime) => unknown;
};

export type AssistantToolSet = Record<string, unknown>;

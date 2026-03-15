import type { OpenClawConfig } from "../config/config.js";
import type { ModelProviderConfig } from "../config/types.js";
import {
  groupExtensionHostDiscoveryProvidersByOrder,
  normalizeExtensionHostDiscoveryResult,
  resolveExtensionHostDiscoveryProviders,
} from "../extension-host/provider-discovery.js";
import { resolvePluginProviders } from "./providers.js";
import type { ProviderDiscoveryOrder, ProviderPlugin } from "./types.js";

export function resolvePluginDiscoveryProviders(params: {
  config?: OpenClawConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
}): ProviderPlugin[] {
  return resolveExtensionHostDiscoveryProviders(resolvePluginProviders(params));
}

export function groupPluginDiscoveryProvidersByOrder(
  providers: ProviderPlugin[],
): Record<ProviderDiscoveryOrder, ProviderPlugin[]> {
  return groupExtensionHostDiscoveryProvidersByOrder(providers);
}

export function normalizePluginDiscoveryResult(params: {
  provider: ProviderPlugin;
  result:
    | { provider: ModelProviderConfig }
    | { providers: Record<string, ModelProviderConfig> }
    | null
    | undefined;
}): Record<string, ModelProviderConfig> {
  return normalizeExtensionHostDiscoveryResult(params);
}

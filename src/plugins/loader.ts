import { createJiti } from "jiti";
import type { OpenClawConfig } from "../config/config.js";
import { activateExtensionHostRegistry } from "../extension-host/activation.js";
import {
  buildExtensionHostRegistryCacheKey,
  clearExtensionHostRegistryCache,
  getCachedExtensionHostRegistry,
  MAX_EXTENSION_HOST_REGISTRY_CACHE_ENTRIES,
  setCachedExtensionHostRegistry,
} from "../extension-host/loader-cache.js";
import {
  listPluginSdkAliasCandidates,
  listPluginSdkExportedSubpaths,
  resolvePluginSdkAlias,
  resolvePluginSdkAliasCandidateOrder,
  resolvePluginSdkAliasFile,
  resolvePluginSdkScopedAliasMap,
} from "../extension-host/loader-compat.js";
import { finalizeExtensionHostRegistryLoad } from "../extension-host/loader-finalize.js";
import { processExtensionHostPluginCandidate } from "../extension-host/loader-flow.js";
import {
  buildExtensionHostProvenanceIndex,
  compareExtensionHostDuplicateCandidateOrder,
  pushExtensionHostDiagnostics,
  warnWhenExtensionAllowlistIsOpen,
} from "../extension-host/loader-policy.js";
import type { GatewayRequestHandler } from "../gateway/server-methods/types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { clearPluginCommands } from "./commands.js";
import { applyTestPluginDefaults, normalizePluginsConfig } from "./config-state.js";
import { discoverOpenClawPlugins } from "./discovery.js";
import { loadPluginManifestRegistry } from "./manifest-registry.js";
import { createPluginRegistry, type PluginRecord, type PluginRegistry } from "./registry.js";
import { createPluginRuntime, type CreatePluginRuntimeOptions } from "./runtime/index.js";
import type { PluginRuntime } from "./runtime/types.js";
import type { OpenClawPluginModule, PluginLogger } from "./types.js";

export type PluginLoadResult = PluginRegistry;

export type PluginLoadOptions = {
  config?: OpenClawConfig;
  workspaceDir?: string;
  // Allows callers to resolve plugin roots and load paths against an explicit env
  // instead of the process-global environment.
  env?: NodeJS.ProcessEnv;
  logger?: PluginLogger;
  coreGatewayHandlers?: Record<string, GatewayRequestHandler>;
  runtimeOptions?: CreatePluginRuntimeOptions;
  cache?: boolean;
  mode?: "full" | "validate";
};

const openAllowlistWarningCache = new Set<string>();

export function clearPluginLoaderCache(): void {
  clearExtensionHostRegistryCache();
  openAllowlistWarningCache.clear();
}

const defaultLogger = () => createSubsystemLogger("plugins");

export const __testing = {
  listPluginSdkAliasCandidates,
  listPluginSdkExportedSubpaths,
  resolvePluginSdkAliasCandidateOrder,
  resolvePluginSdkAliasFile,
  maxPluginRegistryCacheEntries: MAX_EXTENSION_HOST_REGISTRY_CACHE_ENTRIES,
};

export function loadOpenClawPlugins(options: PluginLoadOptions = {}): PluginRegistry {
  const env = options.env ?? process.env;
  // Test env: default-disable plugins unless explicitly configured.
  // This keeps unit/gateway suites fast and avoids loading heavyweight plugin deps by accident.
  const cfg = applyTestPluginDefaults(options.config ?? {}, env);
  const logger = options.logger ?? defaultLogger();
  const validateOnly = options.mode === "validate";
  const normalized = normalizePluginsConfig(cfg.plugins);
  const cacheKey = buildExtensionHostRegistryCacheKey({
    workspaceDir: options.workspaceDir,
    plugins: normalized,
    installs: cfg.plugins?.installs,
    env,
  });
  const cacheEnabled = options.cache !== false;
  if (cacheEnabled) {
    const cached = getCachedExtensionHostRegistry(cacheKey);
    if (cached) {
      activateExtensionHostRegistry(cached, cacheKey);
      return cached;
    }
  }

  // Clear previously registered plugin commands before reloading
  clearPluginCommands();

  // Lazily initialize the runtime so startup paths that discover/skip plugins do
  // not eagerly load every channel runtime dependency.
  let resolvedRuntime: PluginRuntime | null = null;
  const resolveRuntime = (): PluginRuntime => {
    resolvedRuntime ??= createPluginRuntime(options.runtimeOptions);
    return resolvedRuntime;
  };
  const runtime = new Proxy({} as PluginRuntime, {
    get(_target, prop, receiver) {
      return Reflect.get(resolveRuntime(), prop, receiver);
    },
    set(_target, prop, value, receiver) {
      return Reflect.set(resolveRuntime(), prop, value, receiver);
    },
    has(_target, prop) {
      return Reflect.has(resolveRuntime(), prop);
    },
    ownKeys() {
      return Reflect.ownKeys(resolveRuntime() as object);
    },
    getOwnPropertyDescriptor(_target, prop) {
      return Reflect.getOwnPropertyDescriptor(resolveRuntime() as object, prop);
    },
    defineProperty(_target, prop, attributes) {
      return Reflect.defineProperty(resolveRuntime() as object, prop, attributes);
    },
    deleteProperty(_target, prop) {
      return Reflect.deleteProperty(resolveRuntime() as object, prop);
    },
    getPrototypeOf() {
      return Reflect.getPrototypeOf(resolveRuntime() as object);
    },
  });
  const { registry, createApi } = createPluginRegistry({
    logger,
    runtime,
    coreGatewayHandlers: options.coreGatewayHandlers as Record<string, GatewayRequestHandler>,
  });

  const discovery = discoverOpenClawPlugins({
    workspaceDir: options.workspaceDir,
    extraPaths: normalized.loadPaths,
    cache: options.cache,
    env,
  });
  const manifestRegistry = loadPluginManifestRegistry({
    config: cfg,
    workspaceDir: options.workspaceDir,
    cache: options.cache,
    env,
    candidates: discovery.candidates,
    diagnostics: discovery.diagnostics,
  });
  pushExtensionHostDiagnostics(registry.diagnostics, manifestRegistry.diagnostics);
  warnWhenExtensionAllowlistIsOpen({
    logger,
    pluginsEnabled: normalized.enabled,
    allow: normalized.allow,
    warningCacheKey: cacheKey,
    warningCache: openAllowlistWarningCache,
    discoverablePlugins: manifestRegistry.plugins.map((plugin) => ({
      id: plugin.id,
      source: plugin.source,
      origin: plugin.origin,
    })),
  });
  const provenance = buildExtensionHostProvenanceIndex({
    config: cfg,
    normalizedLoadPaths: normalized.loadPaths,
    env,
  });

  // Lazy: avoid creating the Jiti loader when all plugins are disabled (common in unit tests).
  let jitiLoader: ReturnType<typeof createJiti> | null = null;
  const getJiti = () => {
    if (jitiLoader) {
      return jitiLoader;
    }
    const pluginSdkAlias = resolvePluginSdkAlias();
    const aliasMap = {
      ...(pluginSdkAlias ? { "openclaw/plugin-sdk": pluginSdkAlias } : {}),
      ...resolvePluginSdkScopedAliasMap(),
    };
    jitiLoader = createJiti(import.meta.url, {
      interopDefault: true,
      extensions: [".ts", ".tsx", ".mts", ".cts", ".mtsx", ".ctsx", ".js", ".mjs", ".cjs", ".json"],
      ...(Object.keys(aliasMap).length > 0
        ? {
            alias: aliasMap,
          }
        : {}),
    });
    return jitiLoader;
  };

  const manifestByRoot = new Map(
    manifestRegistry.plugins.map((record) => [record.rootDir, record]),
  );
  const orderedCandidates = [...discovery.candidates].toSorted((left, right) => {
    return compareExtensionHostDuplicateCandidateOrder({
      left,
      right,
      manifestByRoot,
      provenance,
      env,
    });
  });

  const seenIds = new Map<string, PluginRecord["origin"]>();
  const memorySlot = normalized.slots.memory;
  let selectedMemoryPluginId: string | null = null;
  let memorySlotMatched = false;

  for (const candidate of orderedCandidates) {
    const manifestRecord = manifestByRoot.get(candidate.rootDir);
    if (!manifestRecord) {
      continue;
    }
    const processed = processExtensionHostPluginCandidate({
      candidate,
      manifestRecord,
      normalizedConfig: normalized,
      rootConfig: cfg,
      validateOnly,
      logger,
      registry,
      seenIds,
      selectedMemoryPluginId,
      createApi,
      loadModule: (safeSource) => getJiti()(safeSource) as OpenClawPluginModule,
    });
    selectedMemoryPluginId = processed.selectedMemoryPluginId;
    memorySlotMatched ||= processed.memorySlotMatched;
  }

  return finalizeExtensionHostRegistryLoad({
    registry,
    memorySlot,
    memorySlotMatched,
    provenance,
    logger,
    env,
    cacheEnabled,
    cacheKey,
    setCachedRegistry: setCachedExtensionHostRegistry,
    activateRegistry: activateExtensionHostRegistry,
  });
}

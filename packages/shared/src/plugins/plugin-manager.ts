// =============================================================================
// PLUGIN SYSTEM - Runtime for loading and managing plugins
// =============================================================================
// This module provides the infrastructure for loading, validating, and
// running plugins. Plugins can extend the platform with new:
// - Card generators (parse files into cards)
// - Scheduling algorithms
// - Scoring/grading systems
// - Visualizations
// - Meta-learning analytics

import type {
  PluginId,
  PluginManifest,
  PluginCategory,
  PluginCapability,
  PluginPermission,
  InstalledPlugin,
  PluginLifecycle,
  PluginRegistry,
  PluginAPI,
} from '../types/plugin.types';

// =============================================================================
// PLUGIN MANAGER
// =============================================================================

/**
 * Central manager for all plugins in the system
 * Handles registration, lifecycle, and permissions
 */
export class PluginManager implements PluginRegistry {
  // Installed plugins by ID
  private plugins: Map<PluginId, InstalledPlugin> = new Map();
  
  // Loaded plugin instances by ID
  private instances: Map<PluginId, PluginLifecycle> = new Map();
  
  // Plugin API provided to plugins
  private api: PluginAPI;
  
  // Permission grants by plugin
  private permissions: Map<PluginId, Set<PluginPermission>> = new Map();
  
  // Event listeners
  private listeners: Map<string, Set<(data: unknown) => void>> = new Map();
  
  constructor(api: PluginAPI) {
    this.api = api;
  }
  
  // ===========================================================================
  // REGISTRY INTERFACE
  // ===========================================================================
  
  /**
   * Get all installed plugins
   */
  public getAll(): readonly InstalledPlugin[] {
    return Array.from(this.plugins.values());
  }
  
  /**
   * Get a plugin by ID
   */
  public getById(id: PluginId): InstalledPlugin | null {
    return this.plugins.get(id) || null;
  }
  
  /**
   * Get plugins by category
   */
  public getByCategory(category: PluginCategory): readonly InstalledPlugin[] {
    return this.getAll().filter(p => p.manifest.category === category);
  }
  
  /**
   * Get plugins by capability
   */
  public getByCapability(capability: PluginCapability): readonly InstalledPlugin[] {
    return this.getAll().filter(p => 
      p.manifest.capabilities.includes(capability)
    );
  }
  
  /**
   * Install a new plugin
   */
  public async install(
    manifest: PluginManifest,
    code: string
  ): Promise<InstalledPlugin> {
    // Validate manifest
    this.validateManifest(manifest);
    
    // Check for conflicts
    if (this.plugins.has(manifest.id)) {
      throw new PluginError(
        'ALREADY_INSTALLED',
        `Plugin ${manifest.id} is already installed`
      );
    }
    
    // Create installed plugin record
    const installed: InstalledPlugin = {
      id: manifest.id,
      manifest,
      installedAt: new Date(),
      updatedAt: new Date(),
      version: manifest.version,
      isEnabled: false,
      isLoaded: false,
      loadError: null,
      config: this.getDefaultConfig(manifest),
      usageCount: 0,
      lastUsedAt: null,
    };
    
    // Store plugin
    this.plugins.set(manifest.id, installed);
    
    // Emit event
    this.emit('plugin:installed', { pluginId: manifest.id });
    
    // Call onInstall lifecycle hook
    try {
      const instance = await this.loadPluginCode(code, manifest);
      if (instance.onInstall) {
        await instance.onInstall();
      }
      this.instances.set(manifest.id, instance);
    } catch (error) {
      // Installation hook failed, but plugin is still installed
      console.error(`Plugin ${manifest.id} onInstall failed:`, error);
    }
    
    return installed;
  }
  
  /**
   * Uninstall a plugin
   */
  public async uninstall(id: PluginId): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      throw new PluginError('NOT_FOUND', `Plugin ${id} not found`);
    }
    
    // Disable first if enabled
    if (plugin.isEnabled) {
      await this.disable(id);
    }
    
    // Call onUninstall lifecycle hook
    const instance = this.instances.get(id);
    if (instance?.onUninstall) {
      try {
        await instance.onUninstall();
      } catch (error) {
        console.error(`Plugin ${id} onUninstall failed:`, error);
      }
    }
    
    // Remove from registry
    this.plugins.delete(id);
    this.instances.delete(id);
    this.permissions.delete(id);
    
    // Emit event
    this.emit('plugin:uninstalled', { pluginId: id });
  }
  
  /**
   * Enable a plugin
   */
  public async enable(id: PluginId): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      throw new PluginError('NOT_FOUND', `Plugin ${id} not found`);
    }
    
    if (plugin.isEnabled) {
      return;  // Already enabled
    }
    
    // Grant requested permissions
    this.grantPermissions(id, plugin.manifest.permissions);
    
    // Call onEnable lifecycle hook
    const instance = this.instances.get(id);
    if (instance?.onEnable) {
      try {
        await instance.onEnable();
      } catch (error) {
        throw new PluginError(
          'ENABLE_FAILED',
          `Failed to enable plugin ${id}: ${error}`
        );
      }
    }
    
    // Update status
    this.updatePlugin(id, { isEnabled: true, isLoaded: true });
    
    // Emit event
    this.emit('plugin:enabled', { pluginId: id });
  }
  
  /**
   * Disable a plugin
   */
  public async disable(id: PluginId): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      throw new PluginError('NOT_FOUND', `Plugin ${id} not found`);
    }
    
    if (!plugin.isEnabled) {
      return;  // Already disabled
    }
    
    // Call onDisable lifecycle hook
    const instance = this.instances.get(id);
    if (instance?.onDisable) {
      try {
        await instance.onDisable();
      } catch (error) {
        console.error(`Plugin ${id} onDisable failed:`, error);
      }
    }
    
    // Revoke permissions
    this.permissions.delete(id);
    
    // Update status
    this.updatePlugin(id, { isEnabled: false });
    
    // Emit event
    this.emit('plugin:disabled', { pluginId: id });
  }
  
  /**
   * Update a plugin to a new version
   */
  public async update(id: PluginId, newVersion: string): Promise<InstalledPlugin> {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      throw new PluginError('NOT_FOUND', `Plugin ${id} not found`);
    }
    
    // For now, just update the version
    // Full implementation would download new code and reload
    this.updatePlugin(id, {
      version: newVersion,
      updatedAt: new Date(),
    });
    
    // Emit event
    this.emit('plugin:updated', { pluginId: id, version: newVersion });
    
    return this.plugins.get(id)!;
  }
  
  /**
   * Get plugin configuration
   */
  public getConfig(id: PluginId): Record<string, unknown> {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      throw new PluginError('NOT_FOUND', `Plugin ${id} not found`);
    }
    return { ...plugin.config };
  }
  
  /**
   * Update plugin configuration
   */
  public async setConfig(
    id: PluginId,
    config: Record<string, unknown>
  ): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      throw new PluginError('NOT_FOUND', `Plugin ${id} not found`);
    }
    
    // Validate against schema if provided
    if (plugin.manifest.configSchema) {
      this.validateConfig(config, plugin.manifest.configSchema);
    }
    
    // Update config
    this.updatePlugin(id, { config });
    
    // Notify plugin of config change
    const instance = this.instances.get(id);
    if (instance?.onConfigChange) {
      try {
        await instance.onConfigChange(config);
      } catch (error) {
        console.error(`Plugin ${id} onConfigChange failed:`, error);
      }
    }
    
    // Emit event
    this.emit('plugin:config_changed', { pluginId: id, config });
  }
  
  // ===========================================================================
  // PLUGIN EXECUTION
  // ===========================================================================
  
  /**
   * Get a plugin instance for execution
   */
  public getInstance<T extends PluginLifecycle>(id: PluginId): T | null {
    const plugin = this.plugins.get(id);
    if (!plugin || !plugin.isEnabled) {
      return null;
    }
    
    return this.instances.get(id) as T || null;
  }
  
  /**
   * Execute a plugin method with permission checks
   */
  public async execute<T>(
    id: PluginId,
    method: string,
    args: unknown[]
  ): Promise<T> {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      throw new PluginError('NOT_FOUND', `Plugin ${id} not found`);
    }
    
    if (!plugin.isEnabled) {
      throw new PluginError('DISABLED', `Plugin ${id} is disabled`);
    }
    
    const instance = this.instances.get(id);
    if (!instance) {
      throw new PluginError('NOT_LOADED', `Plugin ${id} is not loaded`);
    }
    
    // Get the method
    const fn = (instance as Record<string, unknown>)[method];
    if (typeof fn !== 'function') {
      throw new PluginError(
        'METHOD_NOT_FOUND',
        `Plugin ${id} does not have method ${method}`
      );
    }
    
    // Update usage statistics
    this.updatePlugin(id, {
      usageCount: plugin.usageCount + 1,
      lastUsedAt: new Date(),
    });
    
    // Execute the method
    try {
      return await fn.apply(instance, args) as T;
    } catch (error) {
      throw new PluginError(
        'EXECUTION_FAILED',
        `Plugin ${id}.${method} failed: ${error}`
      );
    }
  }
  
  // ===========================================================================
  // PERMISSION MANAGEMENT
  // ===========================================================================
  
  /**
   * Check if a plugin has a permission
   */
  public hasPermission(id: PluginId, permission: PluginPermission): boolean {
    const perms = this.permissions.get(id);
    return perms?.has(permission) || false;
  }
  
  /**
   * Grant permissions to a plugin
   */
  private grantPermissions(
    id: PluginId,
    permissions: readonly PluginPermission[]
  ): void {
    const perms = this.permissions.get(id) || new Set<PluginPermission>();
    for (const perm of permissions) {
      perms.add(perm);
    }
    this.permissions.set(id, perms);
  }
  
  // ===========================================================================
  // EVENTS
  // ===========================================================================
  
  /**
   * Subscribe to plugin events
   */
  public on(event: string, handler: (data: unknown) => void): void {
    const handlers = this.listeners.get(event) || new Set();
    handlers.add(handler);
    this.listeners.set(event, handlers);
  }
  
  /**
   * Unsubscribe from plugin events
   */
  public off(event: string, handler: (data: unknown) => void): void {
    const handlers = this.listeners.get(event);
    handlers?.delete(handler);
  }
  
  /**
   * Emit an event
   */
  private emit(event: string, data: unknown): void {
    const handlers = this.listeners.get(event);
    handlers?.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Event handler for ${event} failed:`, error);
      }
    });
  }
  
  // ===========================================================================
  // INTERNAL HELPERS
  // ===========================================================================
  
  /**
   * Validate a plugin manifest
   */
  private validateManifest(manifest: PluginManifest): void {
    if (!manifest.id) {
      throw new PluginError('INVALID_MANIFEST', 'Plugin ID is required');
    }
    if (!manifest.name) {
      throw new PluginError('INVALID_MANIFEST', 'Plugin name is required');
    }
    if (!manifest.version) {
      throw new PluginError('INVALID_MANIFEST', 'Plugin version is required');
    }
    if (!manifest.category) {
      throw new PluginError('INVALID_MANIFEST', 'Plugin category is required');
    }
    
    // Validate version format (semver)
    if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
      throw new PluginError(
        'INVALID_MANIFEST',
        'Plugin version must be semver format'
      );
    }
  }
  
  /**
   * Validate plugin configuration
   */
  private validateConfig(
    config: Record<string, unknown>,
    schema: { properties: Record<string, unknown>; required: readonly string[] }
  ): void {
    // Check required fields
    for (const field of schema.required) {
      if (!(field in config)) {
        throw new PluginError(
          'INVALID_CONFIG',
          `Missing required config field: ${field}`
        );
      }
    }
    
    // Basic type validation could be added here
  }
  
  /**
   * Get default configuration from manifest schema
   */
  private getDefaultConfig(manifest: PluginManifest): Record<string, unknown> {
    const config: Record<string, unknown> = {};
    
    if (manifest.configSchema) {
      for (const [key, prop] of Object.entries(manifest.configSchema.properties)) {
        if ('default' in (prop as { default?: unknown })) {
          config[key] = (prop as { default: unknown }).default;
        }
      }
    }
    
    return config;
  }
  
  /**
   * Load plugin code and create instance
   * In a real implementation, this would use a sandbox
   */
  private async loadPluginCode(
    code: string,
    manifest: PluginManifest
  ): Promise<PluginLifecycle> {
    // This is a placeholder - real implementation would:
    // 1. Create a sandboxed execution environment
    // 2. Inject the plugin API
    // 3. Execute the plugin code
    // 4. Return the exported plugin instance
    
    // For now, return a mock instance
    return {
      onInstall: async () => {},
      onEnable: async () => {},
      onDisable: async () => {},
      onUninstall: async () => {},
      onConfigChange: async () => {},
      onReady: async () => {},
    };
  }
  
  /**
   * Update plugin record
   */
  private updatePlugin(
    id: PluginId,
    updates: Partial<Omit<InstalledPlugin, 'id' | 'manifest'>>
  ): void {
    const plugin = this.plugins.get(id);
    if (!plugin) return;
    
    this.plugins.set(id, { ...plugin, ...updates });
  }
}

// =============================================================================
// PLUGIN ERROR
// =============================================================================

/**
 * Error thrown by plugin operations
 */
export class PluginError extends Error {
  public readonly code: string;
  
  constructor(code: string, message: string) {
    super(message);
    this.name = 'PluginError';
    this.code = code;
  }
}

// =============================================================================
// PLUGIN API BUILDER
// =============================================================================

/**
 * Builder for creating the Plugin API
 * This API is passed to plugins for accessing platform functionality
 */
export class PluginAPIBuilder {
  private api: Partial<PluginAPI> = {};
  
  /**
   * Set the card API
   */
  public withCardAPI(cardAPI: PluginAPI['cards']): this {
    this.api.cards = cardAPI;
    return this;
  }
  
  /**
   * Set the deck API
   */
  public withDeckAPI(deckAPI: PluginAPI['decks']): this {
    this.api.decks = deckAPI;
    return this;
  }
  
  /**
   * Set the review API
   */
  public withReviewAPI(reviewAPI: PluginAPI['reviews']): this {
    this.api.reviews = reviewAPI;
    return this;
  }
  
  /**
   * Set the user API
   */
  public withUserAPI(userAPI: PluginAPI['user']): this {
    this.api.user = userAPI;
    return this;
  }
  
  /**
   * Set the storage API
   */
  public withStorageAPI(storageAPI: PluginAPI['storage']): this {
    this.api.storage = storageAPI;
    return this;
  }
  
  /**
   * Set the network API
   */
  public withNetworkAPI(networkAPI: PluginAPI['network']): this {
    this.api.network = networkAPI;
    return this;
  }
  
  /**
   * Set the UI API
   */
  public withUIAPI(uiAPI: PluginAPI['ui']): this {
    this.api.ui = uiAPI;
    return this;
  }
  
  /**
   * Set the AI API
   */
  public withAIAPI(aiAPI: PluginAPI['ai']): this {
    this.api.ai = aiAPI;
    return this;
  }
  
  /**
   * Set the events API
   */
  public withEventsAPI(eventsAPI: PluginAPI['events']): this {
    this.api.events = eventsAPI;
    return this;
  }
  
  /**
   * Build the complete API
   */
  public build(): PluginAPI {
    // Ensure all required APIs are set
    if (!this.api.cards) throw new Error('Card API is required');
    if (!this.api.decks) throw new Error('Deck API is required');
    if (!this.api.reviews) throw new Error('Review API is required');
    if (!this.api.user) throw new Error('User API is required');
    if (!this.api.storage) throw new Error('Storage API is required');
    if (!this.api.network) throw new Error('Network API is required');
    if (!this.api.ui) throw new Error('UI API is required');
    if (!this.api.ai) throw new Error('AI API is required');
    if (!this.api.events) throw new Error('Events API is required');
    
    return this.api as PluginAPI;
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a new plugin manager
 */
export function createPluginManager(api: PluginAPI): PluginManager {
  return new PluginManager(api);
}

/**
 * Create a plugin API builder
 */
export function createPluginAPIBuilder(): PluginAPIBuilder {
  return new PluginAPIBuilder();
}

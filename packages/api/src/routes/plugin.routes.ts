// =============================================================================
// PLUGIN ROUTES
// =============================================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

// =============================================================================
// SCHEMAS
// =============================================================================

const installPluginSchema = z.object({
  pluginId: z.string(),
});

const updatePluginSettingsSchema = z.object({
  settings: z.record(z.any()),
});

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  category: z.string().optional(),
  search: z.string().optional(),
  isVerified: z.coerce.boolean().optional(),
});

// =============================================================================
// ROUTES
// =============================================================================

export async function pluginRoutes(app: FastifyInstance) {
  // Browse available plugins
  app.get('/', {
    schema: {
      tags: ['Plugins'],
      summary: 'Browse available plugins',
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = querySchema.parse(request.query);
    
    const where: any = {};
    
    if (query.category) where.category = query.category;
    if (query.isVerified !== undefined) where.isVerified = query.isVerified;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    
    const [plugins, total] = await Promise.all([
      prisma.plugin.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: [
          { isOfficial: 'desc' },
          { downloadCount: 'desc' },
        ],
      }),
      prisma.plugin.count({ where }),
    ]);
    
    return {
      data: plugins,
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + query.limit < total,
      },
    };
  });
  
  // Get plugin details
  app.get('/:id', {
    schema: {
      tags: ['Plugins'],
      summary: 'Get plugin details',
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    
    const plugin = await prisma.plugin.findUnique({
      where: { id },
    });
    
    if (!plugin) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Plugin not found',
      });
    }
    
    return plugin;
  });
  
  // Get user's installed plugins
  app.get('/installed', {
    onRequest: [authenticate],
    schema: {
      tags: ['Plugins'],
      summary: 'Get installed plugins',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;
    
    const installed = await prisma.userPlugin.findMany({
      where: { userId },
      include: {
        plugin: true,
      },
    });
    
    return installed.map((up) => ({
      ...up.plugin,
      isEnabled: up.isEnabled,
      settings: up.settings,
      installedAt: up.installedAt,
    }));
  });
  
  // Install a plugin
  app.post('/install', {
    onRequest: [authenticate],
    schema: {
      tags: ['Plugins'],
      summary: 'Install a plugin',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = installPluginSchema.parse(request.body);
    const userId = request.user!.id;
    
    // Check plugin exists
    const plugin = await prisma.plugin.findUnique({
      where: { id: body.pluginId },
    });
    
    if (!plugin) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Plugin not found',
      });
    }
    
    // Check if already installed
    const existing = await prisma.userPlugin.findUnique({
      where: { userId_pluginId: { userId, pluginId: body.pluginId } },
    });
    
    if (existing) {
      return reply.status(409).send({
        error: 'Conflict',
        message: 'Plugin already installed',
      });
    }
    
    // Install plugin
    const userPlugin = await prisma.userPlugin.create({
      data: {
        userId,
        pluginId: body.pluginId,
        settings: {},
      },
      include: { plugin: true },
    });
    
    // Increment download count
    await prisma.plugin.update({
      where: { id: body.pluginId },
      data: { downloadCount: { increment: 1 } },
    });
    
    return reply.status(201).send({
      ...userPlugin.plugin,
      isEnabled: userPlugin.isEnabled,
      settings: userPlugin.settings,
      installedAt: userPlugin.installedAt,
    });
  });
  
  // Uninstall a plugin
  app.delete('/:id/uninstall', {
    onRequest: [authenticate],
    schema: {
      tags: ['Plugins'],
      summary: 'Uninstall a plugin',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const userId = request.user!.id;
    
    const userPlugin = await prisma.userPlugin.findUnique({
      where: { userId_pluginId: { userId, pluginId: id } },
    });
    
    if (!userPlugin) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Plugin not installed',
      });
    }
    
    await prisma.userPlugin.delete({
      where: { id: userPlugin.id },
    });
    
    return { message: 'Plugin uninstalled' };
  });
  
  // Enable/disable a plugin
  app.patch('/:id/toggle', {
    onRequest: [authenticate],
    schema: {
      tags: ['Plugins'],
      summary: 'Enable or disable a plugin',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const userId = request.user!.id;
    
    const userPlugin = await prisma.userPlugin.findUnique({
      where: { userId_pluginId: { userId, pluginId: id } },
    });
    
    if (!userPlugin) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Plugin not installed',
      });
    }
    
    const updated = await prisma.userPlugin.update({
      where: { id: userPlugin.id },
      data: { isEnabled: !userPlugin.isEnabled },
    });
    
    return { isEnabled: updated.isEnabled };
  });
  
  // Update plugin settings
  app.patch('/:id/settings', {
    onRequest: [authenticate],
    schema: {
      tags: ['Plugins'],
      summary: 'Update plugin settings',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const body = updatePluginSettingsSchema.parse(request.body);
    const userId = request.user!.id;
    
    const userPlugin = await prisma.userPlugin.findUnique({
      where: { userId_pluginId: { userId, pluginId: id } },
    });
    
    if (!userPlugin) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Plugin not installed',
      });
    }
    
    const updated = await prisma.userPlugin.update({
      where: { id: userPlugin.id },
      data: {
        settings: {
          ...(userPlugin.settings as any),
          ...body.settings,
        },
      },
    });
    
    return { settings: updated.settings };
  });
  
  // Get plugin categories
  app.get('/categories', {
    schema: {
      tags: ['Plugins'],
      summary: 'Get plugin categories',
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const categories = await prisma.plugin.groupBy({
      by: ['category'],
      _count: { category: true },
    });
    
    return categories.map((c) => ({
      name: c.category,
      count: c._count.category,
    }));
  });
}

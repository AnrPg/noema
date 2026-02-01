// =============================================================================
// UPLOAD ROUTES
// =============================================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { prisma } from "../config/database.js";
import { uploadFile, getPresignedUrl, deleteFile } from "../config/storage.js";
import { authenticate } from "../middleware/auth.js";
import crypto from "crypto";

// =============================================================================
// ROUTES
// =============================================================================

export async function uploadRoutes(app: FastifyInstance) {
  // Upload a file
  app.post(
    "/",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Uploads"],
        summary: "Upload a file",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;

      const data = await request.file();

      if (!data) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "No file provided",
        });
      }

      // Validate file type
      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "audio/mpeg",
        "audio/wav",
        "audio/ogg",
        "video/mp4",
        "video/webm",
        "application/pdf",
        "text/plain",
        "text/markdown",
        "application/json",
        "text/csv",
        // Anki format
        "application/zip",
        "application/octet-stream",
      ];

      if (!allowedTypes.includes(data.mimetype)) {
        return reply.status(400).send({
          error: "Bad Request",
          message: `File type not allowed: ${data.mimetype}`,
        });
      }

      // Generate unique filename
      const ext = data.filename.split(".").pop() || "";
      const uniqueFilename = `${userId}/${crypto.randomUUID()}.${ext}`;

      // Read file buffer
      const buffer = await data.toBuffer();

      // Upload to storage
      const url = await uploadFile(uniqueFilename, buffer, data.mimetype);

      // Create upload record
      const upload = await prisma.upload.create({
        data: {
          userId,
          filename: uniqueFilename,
          originalName: data.filename,
          mimeType: data.mimetype,
          size: buffer.length,
          bucket: "manthanein",
          key: uniqueFilename,
          url,
          status: "ready",
        },
      });

      return reply.status(201).send(upload);
    },
  );

  // Get upload by ID
  app.get<{ Params: { id: string } }>(
    "/:id",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Uploads"],
        summary: "Get upload details",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const userId = request.user!.id;

      const upload = await prisma.upload.findFirst({
        where: { id, userId },
      });

      if (!upload) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Upload not found",
        });
      }

      return upload;
    },
  );

  // Get presigned URL for download
  app.get<{ Params: { id: string } }>(
    "/:id/download",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Uploads"],
        summary: "Get download URL",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const userId = request.user!.id;

      const upload = await prisma.upload.findFirst({
        where: { id, userId },
      });

      if (!upload) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Upload not found",
        });
      }

      const downloadUrl = await getPresignedUrl(upload.key, 3600); // 1 hour

      return { downloadUrl };
    },
  );

  // Delete upload
  app.delete<{ Params: { id: string } }>(
    "/:id",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Uploads"],
        summary: "Delete upload",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const userId = request.user!.id;

      const upload = await prisma.upload.findFirst({
        where: { id, userId },
      });

      if (!upload) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Upload not found",
        });
      }

      // Delete from storage
      await deleteFile(upload.key);

      // Delete record
      await prisma.upload.delete({ where: { id } });

      return { message: "Upload deleted" };
    },
  );

  // List user uploads
  app.get(
    "/",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Uploads"],
        summary: "List uploads",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;
      const { limit = 20, offset = 0 } = request.query as {
        limit?: number;
        offset?: number;
      };

      const [uploads, total] = await Promise.all([
        prisma.upload.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.upload.count({ where: { userId } }),
      ]);

      return {
        data: uploads,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      };
    },
  );

  // Parse uploaded file and generate cards
  app.post<{ Params: { id: string } }>(
    "/:id/parse",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Uploads"],
        summary: "Parse file and generate cards",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const userId = request.user!.id;
      const { deckId, options } = request.body as {
        deckId: string;
        options?: any;
      };

      const upload = await prisma.upload.findFirst({
        where: { id, userId },
      });

      if (!upload) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Upload not found",
        });
      }

      // Update status to processing
      await prisma.upload.update({
        where: { id },
        data: { status: "processing" },
      });

      // TODO: Implement actual parsing based on file type
      // This would integrate with the AI service for intelligent parsing

      // For now, return a placeholder response
      return {
        message: "Parsing started",
        uploadId: id,
        status: "processing",
      };
    },
  );
}

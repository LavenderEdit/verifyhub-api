import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
} from './dto/create-template.dto.js';
import DOMPurify from 'isomorphic-dompurify';

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(workspaceId: string, userId: string, dto: CreateTemplateDto) {
    // 1. Verify uniqueness of template name in workspace
    const existing = await this.prisma.template.findUnique({
      where: {
        workspaceId_name: {
          workspaceId,
          name: dto.name,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        'Ya existe una plantilla con ese nombre en este workspace.',
      );
    }

    // 2. Sanitize HTML body if provided
    const sanitizedHtml = dto.bodyHtml
      ? DOMPurify.sanitize(dto.bodyHtml)
      : null;

    // 3. Create template and initial version (v1) in transaction
    const template = await this.prisma.$transaction(async (tx) => {
      const tmpl = await tx.template.create({
        data: {
          name: dto.name,
          workspaceId,
          type: dto.type,
        },
      });

      await tx.templateVersion.create({
        data: {
          templateId: tmpl.id,
          versionNumber: 1,
          subject: dto.subject,
          bodyHtml: sanitizedHtml,
          bodyText: dto.bodyText,
          isCurrent: true,
          createdById: userId,
        },
      });

      return tmpl;
    });

    this.logger.log(
      `Template "${template.name}" (v1) created by user ${userId}`,
    );
    return this.findOne(workspaceId, template.id);
  }

  async findAll(workspaceId: string) {
    return this.prisma.template.findMany({
      where: { workspaceId },
      include: {
        versions: {
          where: { isCurrent: true },
        },
      },
    });
  }

  async findOne(workspaceId: string, id: string) {
    const template = await this.prisma.template.findFirst({
      where: { id, workspaceId },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
        },
      },
    });

    if (!template) {
      throw new NotFoundException('Plantilla no encontrada.');
    }

    return template;
  }

  async update(
    workspaceId: string,
    userId: string,
    id: string,
    dto: UpdateTemplateDto,
  ) {
    const template = await this.prisma.template.findFirst({
      where: { id, workspaceId },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
        },
      },
    });

    if (!template) {
      throw new NotFoundException('Plantilla no encontrada.');
    }

    const currentVersion = template.versions.find((v) => v.isCurrent);
    if (!currentVersion) {
      throw new Error('No current active version found for this template.');
    }

    const nextVersionNumber = template.versions[0].versionNumber + 1;
    const sanitizedHtml =
      dto.bodyHtml !== undefined
        ? dto.bodyHtml
          ? DOMPurify.sanitize(dto.bodyHtml)
          : null
        : currentVersion.bodyHtml;

    await this.prisma.$transaction(async (tx) => {
      // Deactivate current active version
      await tx.templateVersion.updateMany({
        where: { templateId: id, isCurrent: true },
        data: { isCurrent: false },
      });

      // Create new current active version
      await tx.templateVersion.create({
        data: {
          templateId: id,
          versionNumber: nextVersionNumber,
          subject:
            dto.subject !== undefined ? dto.subject : currentVersion.subject,
          bodyHtml: sanitizedHtml,
          bodyText:
            dto.bodyText !== undefined ? dto.bodyText : currentVersion.bodyText,
          isCurrent: true,
          createdById: userId,
        },
      });
    });

    this.logger.log(
      `Template "${template.name}" updated to v${nextVersionNumber} by user ${userId}`,
    );
    return this.findOne(workspaceId, id);
  }

  async rollback(
    workspaceId: string,
    userId: string,
    id: string,
    versionNumber: number,
  ) {
    const template = await this.prisma.template.findFirst({
      where: { id, workspaceId },
      include: { versions: true },
    });

    if (!template) {
      throw new NotFoundException('Plantilla no encontrada.');
    }

    const targetVersion = template.versions.find(
      (v) => v.versionNumber === versionNumber,
    );
    if (!targetVersion) {
      throw new NotFoundException(
        `La versión ${versionNumber} de la plantilla no existe.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.templateVersion.updateMany({
        where: { templateId: id, isCurrent: true },
        data: { isCurrent: false },
      });

      await tx.templateVersion.update({
        where: { id: targetVersion.id },
        data: { isCurrent: true },
      });
    });

    this.logger.log(
      `Template "${template.name}" rolled back to version ${versionNumber} by user ${userId}`,
    );
    return this.findOne(workspaceId, id);
  }

  async remove(workspaceId: string, id: string) {
    const template = await this.prisma.template.findFirst({
      where: { id, workspaceId },
    });

    if (!template) {
      throw new NotFoundException('Plantilla no encontrada.');
    }

    await this.prisma.template.delete({
      where: { id },
    });

    this.logger.log(`Template ${id} deleted for workspace ${workspaceId}`);
    return { success: true };
  }

  async preview(
    workspaceId: string,
    id: string,
    variables?: Record<string, any>,
  ) {
    const template = await this.prisma.template.findFirst({
      where: { id, workspaceId },
      include: {
        versions: {
          where: { isCurrent: true },
        },
      },
    });

    if (!template || template.versions.length === 0) {
      throw new NotFoundException('Plantilla o versión activa no encontrada.');
    }

    const currentVersion = template.versions[0];
    const mockVars = {
      code: '123456',
      appName: 'App Demo',
      expiresInMinutes: 5,
      purpose: 'Verificación de Correo',
      actionUrl: 'https://verifyhub.com/verify?code=123456',
      tenantName: 'VerifyHub Inc.',
      supportEmail: 'soporte@verifyhub.com',
      ...variables,
    };

    const previewSubject = currentVersion.subject
      ? this.renderVariables(currentVersion.subject, mockVars)
      : null;
    const previewHtml = currentVersion.bodyHtml
      ? this.renderVariables(currentVersion.bodyHtml, mockVars)
      : null;
    const previewText = this.renderVariables(currentVersion.bodyText, mockVars);

    return {
      templateId: id,
      name: template.name,
      type: template.type,
      version: currentVersion.versionNumber,
      subject: previewSubject,
      html: previewHtml,
      text: previewText,
    };
  }

  renderVariables(content: string, variables: Record<string, any>): string {
    let rendered = content;
    const allowedVars = [
      'code',
      'appName',
      'expiresInMinutes',
      'purpose',
      'actionUrl',
      'tenantName',
      'supportEmail',
    ];
    for (const key of allowedVars) {
      const value =
        variables[key] !== undefined ? String(variables[key]) : `{{${key}}}`;
      rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return rendered;
  }
}

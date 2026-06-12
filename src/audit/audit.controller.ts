import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '@prisma/client';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('Audit & Compliance')
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.DEVELOPER, Role.VIEWER)
  @ApiOperation({
    summary: 'Get paginated and filtered audit logs for the workspace',
  })
  @ApiResponse({ status: 200, description: 'Audit logs returned' })
  async getLogs(
    @Query('workspaceId') workspaceId: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('projectId') projectId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 50;

    return this.auditService.findLogs(
      workspaceId,
      { action, userId, projectId, startDate, endDate },
      pageNum,
      limitNum,
    );
  }

  @Get('export')
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Export audit logs to CSV format' })
  @ApiResponse({ status: 200, description: 'CSV file returned' })
  async exportCsv(
    @Res() res: any,
    @Query('workspaceId') workspaceId: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('projectId') projectId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const csv = await this.auditService.exportCsv(workspaceId, {
      action,
      userId,
      projectId,
      startDate,
      endDate,
    });

    res.header('Content-Type', 'text/csv');
    res.header(
      'Content-Disposition',
      `attachment; filename=audit-logs-${Date.now()}.csv`,
    );
    res.send(csv);
  }
}

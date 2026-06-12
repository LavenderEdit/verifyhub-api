import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SmtpConnectorService } from './smtp-connector.service.js';
import {
  CreateSmtpConnectorDto,
  UpdateSmtpConnectorDto,
} from './dto/create-smtp-connector.dto.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { Role } from '@prisma/client';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('Connectors - SMTP')
@Controller('connectors/smtp')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SmtpConnectorController {
  constructor(private readonly smtpService: SmtpConnectorService) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Create a new SMTP connector for a workspace' })
  @ApiResponse({
    status: 201,
    description: 'SMTP connector created successfully',
  })
  async create(
    @Query('workspaceId') workspaceId: string,
    @Body() createSmtpConnectorDto: CreateSmtpConnectorDto,
  ) {
    return this.smtpService.create(workspaceId, createSmtpConnectorDto);
  }

  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.DEVELOPER, Role.VIEWER)
  @ApiOperation({ summary: 'List all SMTP connectors in a workspace' })
  @ApiResponse({ status: 200, description: 'SMTP connectors list returned' })
  async findAll(@Query('workspaceId') workspaceId: string) {
    return this.smtpService.findAll(workspaceId);
  }

  @Get(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.DEVELOPER, Role.VIEWER)
  @ApiOperation({ summary: 'Get details of an SMTP connector' })
  @ApiResponse({ status: 200, description: 'SMTP connector details returned' })
  async findOne(
    @Query('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.smtpService.findOne(workspaceId, id);
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Update an SMTP connector' })
  @ApiResponse({ status: 200, description: 'SMTP connector updated' })
  async update(
    @Query('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() updateSmtpConnectorDto: UpdateSmtpConnectorDto,
  ) {
    return this.smtpService.update(workspaceId, id, updateSmtpConnectorDto);
  }

  @Delete(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Delete an SMTP connector' })
  @ApiResponse({ status: 200, description: 'SMTP connector deleted' })
  async remove(
    @Query('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.smtpService.remove(workspaceId, id);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({
    summary: 'Test credentials and connection of an SMTP connector',
  })
  @ApiResponse({ status: 200, description: 'Connection status returned' })
  async testConnection(
    @Query('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.smtpService.testConnection(workspaceId, id);
  }
}

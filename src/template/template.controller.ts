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
import { TemplateService } from './template.service.js';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  PreviewTemplateDto,
} from './dto/create-template.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { GetUser } from '../auth/decorators/get-user.decorator.js';
import { Role } from '@prisma/client';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('Templates')
@Controller('templates')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.DEVELOPER)
  @ApiOperation({ summary: 'Create a new verification template' })
  @ApiResponse({ status: 201, description: 'Template created successfully' })
  async create(
    @Query('workspaceId') workspaceId: string,
    @GetUser('id') userId: string,
    @Body() createTemplateDto: CreateTemplateDto,
  ) {
    return this.templateService.create(workspaceId, userId, createTemplateDto);
  }

  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.DEVELOPER, Role.VIEWER)
  @ApiOperation({ summary: 'List all templates in a workspace' })
  @ApiResponse({ status: 200, description: 'List of templates returned' })
  async findAll(@Query('workspaceId') workspaceId: string) {
    return this.templateService.findAll(workspaceId);
  }

  @Get(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.DEVELOPER, Role.VIEWER)
  @ApiOperation({ summary: 'Get details and version history of a template' })
  @ApiResponse({ status: 200, description: 'Template details returned' })
  async findOne(
    @Query('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.templateService.findOne(workspaceId, id);
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.DEVELOPER)
  @ApiOperation({ summary: 'Update template and create a new version' })
  @ApiResponse({ status: 200, description: 'Template updated successfully' })
  async update(
    @Query('workspaceId') workspaceId: string,
    @GetUser('id') userId: string,
    @Param('id') id: string,
    @Body() updateTemplateDto: UpdateTemplateDto,
  ) {
    return this.templateService.update(
      workspaceId,
      userId,
      id,
      updateTemplateDto,
    );
  }

  @Delete(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Delete a template' })
  @ApiResponse({ status: 200, description: 'Template deleted' })
  async remove(
    @Query('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.templateService.remove(workspaceId, id);
  }

  @Post(':id/preview')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.OWNER, Role.ADMIN, Role.DEVELOPER, Role.VIEWER)
  @ApiOperation({
    summary: 'Preview current active version of a template with mock values',
  })
  @ApiResponse({ status: 200, description: 'Template preview rendered' })
  async preview(
    @Query('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() previewTemplateDto: PreviewTemplateDto,
  ) {
    return this.templateService.preview(
      workspaceId,
      id,
      previewTemplateDto.variables,
    );
  }

  @Post(':id/rollback/:version')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.OWNER, Role.ADMIN, Role.DEVELOPER)
  @ApiOperation({ summary: 'Rollback template to a previous version number' })
  @ApiResponse({ status: 200, description: 'Template active version restored' })
  async rollback(
    @Query('workspaceId') workspaceId: string,
    @GetUser('id') userId: string,
    @Param('id') id: string,
    @Param('version') versionNumber: string,
  ) {
    return this.templateService.rollback(
      workspaceId,
      userId,
      id,
      parseInt(versionNumber, 10),
    );
  }
}

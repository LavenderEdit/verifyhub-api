import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ChallengeService } from './challenge.service.js';
import {
  CreateChallengeDto,
  VerifyChallengeDto,
} from './dto/create-challenge.dto.js';
import { ApiKeyGuard } from '../api-key/guards/api-key.guard.js';
import { RequiredScopes } from '../api-key/decorators/required-scopes.decorator.js';
import { ProjectContext } from './decorators/project-context.decorator.js';
import { RateLimitGuard } from '../common/security/rate-limit.guard.js';
import { RateLimit } from '../common/security/rate-limit.decorator.js';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';

@ApiTags('Verification Plane (M2M)')
@ApiSecurity('x-api-key')
@Controller('challenges')
@UseGuards(ApiKeyGuard, RateLimitGuard)
export class ChallengeController {
  constructor(private readonly challengeService: ChallengeService) {}

  @Post()
  @RequiredScopes('challenge:create')
  @RateLimit({ ttl: 60, limit: 10, keyPrefix: 'otp-create' }) // Prevent OTP flood abuse
  @ApiOperation({ summary: 'Create and dispatch a verification challenge' })
  @ApiResponse({ status: 201, description: 'Challenge queued successfully' })
  @ApiResponse({
    status: 429,
    description: 'Throttled or cooldown in progress',
  })
  async create(
    @ProjectContext('id') projectId: string,
    @ProjectContext('workspaceId') workspaceId: string,
    @Body() createChallengeDto: CreateChallengeDto,
  ) {
    return this.challengeService.createChallenge(
      projectId,
      workspaceId,
      createChallengeDto,
    );
  }

  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  @RequiredScopes('challenge:verify')
  @RateLimit({ ttl: 60, limit: 5, keyPrefix: 'otp-verify' }) // Defend against brute force
  @ApiOperation({ summary: 'Verify an OTP code for a challenge' })
  @ApiResponse({ status: 200, description: 'Code verified successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid code, expired, or maximum attempts reached',
  })
  async verify(
    @ProjectContext('id') projectId: string,
    @Param('id') id: string,
    @Body() verifyChallengeDto: VerifyChallengeDto,
  ) {
    return this.challengeService.verifyChallenge(
      id,
      projectId,
      verifyChallengeDto.code,
    );
  }

  @Post(':id/resend')
  @HttpCode(HttpStatus.OK)
  @RequiredScopes('challenge:create')
  @RateLimit({ ttl: 60, limit: 3, keyPrefix: 'otp-resend' })
  @ApiOperation({
    summary: 'Resend OTP code for an active challenge under cooldown rules',
  })
  @ApiResponse({ status: 200, description: 'OTP resent and queued' })
  @ApiResponse({ status: 429, description: 'Resend cooldown in progress' })
  async resend(
    @ProjectContext('id') projectId: string,
    @Param('id') id: string,
  ) {
    return this.challengeService.resendChallenge(id, projectId);
  }

  @Get(':id')
  @RequiredScopes('challenge:read')
  @ApiOperation({ summary: 'Get current status of a verification challenge' })
  @ApiResponse({ status: 200, description: 'Status details returned' })
  async findOne(
    @ProjectContext('id') projectId: string,
    @Param('id') id: string,
  ) {
    return this.challengeService.findOne(id, projectId);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequiredScopes('challenge:verify')
  @ApiOperation({
    summary: 'Cancel/invalidate an active verification challenge',
  })
  @ApiResponse({ status: 200, description: 'Challenge cancelled successfully' })
  async cancel(
    @ProjectContext('id') projectId: string,
    @Param('id') id: string,
  ) {
    return this.challengeService.cancelChallenge(id, projectId);
  }
}

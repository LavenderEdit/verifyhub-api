import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum ApiScope {
  ChallengeCreate = 'challenge:create',
  ChallengeVerify = 'challenge:verify',
  ChallengeRead = 'challenge:read',
  TemplateRead = 'template:read',
  WebhookSend = 'webhook:send',
}

export class CreateApiKeyDto {
  @ApiProperty({ example: 'Production Backend API Key', description: 'Descriptive name for the API key' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la API Key es obligatorio' })
  name!: string;

  @ApiProperty({
    example: ['challenge:create', 'challenge:verify'],
    description: 'Scopes/permissions granted to this key',
    enum: ApiScope,
    isArray: true,
  })
  @IsArray()
  @IsEnum(ApiScope, { each: true, message: 'Scope no válido' })
  scopes!: ApiScope[];

  @ApiProperty({ example: '2027-12-31T23:59:59.000Z', description: 'Optional expiration date', required: false })
  @IsOptional()
  expiresAt?: string;
}

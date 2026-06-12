import {
  IsString,
  IsUrl,
  IsArray,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWebhookEndpointDto {
  @ApiProperty({
    description: 'The target URL to receive POST requests for webhook events',
    example: 'https://api.myclient.com/webhooks',
  })
  @IsUrl()
  url: string;

  @ApiProperty({
    description: 'List of events this webhook listens to',
    example: ['challenge.sent', 'challenge.verified'],
  })
  @IsArray()
  @IsString({ each: true })
  events: string[];
}

export class UpdateWebhookEndpointDto {
  @ApiProperty({
    description: 'The target URL to receive POST requests',
    example: 'https://api.myclient.com/webhooks-updated',
    required: false,
  })
  @IsUrl()
  @IsOptional()
  url?: string;

  @ApiProperty({
    description: 'List of events this webhook listens to',
    example: ['challenge.sent', 'challenge.verified'],
    required: false,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  events?: string[];

  @ApiProperty({
    description: 'Whether the webhook is active',
    example: true,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

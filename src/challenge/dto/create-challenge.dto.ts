import {
  IsEmail,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsString,
  IsJSON,
  IsObject,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Channel, ChallengePurpose } from '@prisma/client';

export class CreateChallengeDto {
  @ApiProperty({
    example: 'EMAIL',
    enum: Channel,
    description: 'Channel to send the OTP: EMAIL or WHATSAPP',
  })
  @IsEnum(Channel, { message: 'El canal debe ser EMAIL o WHATSAPP' })
  channel!: Channel;

  @ApiProperty({
    example: 'VERIFY_EMAIL',
    enum: ChallengePurpose,
    description: 'The verification purpose',
  })
  @IsEnum(ChallengePurpose, { message: 'Propósito de verificación no válido' })
  purpose!: ChallengePurpose;

  @ApiProperty({
    example: 'user@example.com',
    description:
      'Destination email address or WhatsApp phone number (with country code)',
  })
  @IsString()
  @IsNotEmpty({ message: 'El destino de envío es obligatorio' })
  destination!: string;

  @ApiProperty({
    example: 'email_verification',
    description:
      'Name of the template to use (optional, falls back to default layout if omitted)',
    required: false,
  })
  @IsString()
  @IsOptional()
  templateName?: string;

  @ApiProperty({
    example: {
      appName: 'My App',
      actionUrl: 'https://example.com/confirm?token=xyz',
    },
    description: 'Custom metadata and template variable overrides',
    required: false,
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;

  @ApiProperty({
    example: 'idemp-key-123456',
    description: 'Optional key to prevent duplicate delivery requests',
    required: false,
  })
  @IsString()
  @IsOptional()
  idempotencyKey?: string;

  @ApiProperty({
    example: 'es',
    description: 'Optional locale: es or en',
    required: false,
  })
  @IsString()
  @IsOptional()
  locale?: string;
}

export class VerifyChallengeDto {
  @ApiProperty({
    example: '123456',
    description: 'The 6-digit OTP code to verify',
    minLength: 6,
    maxLength: 6,
  })
  @IsString()
  @IsNotEmpty({ message: 'El código de verificación es obligatorio' })
  @MinLength(6, { message: 'El código debe tener 6 caracteres' })
  @MaxLength(6, { message: 'El código debe tener 6 caracteres' })
  code!: string;
}

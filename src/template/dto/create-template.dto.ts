import { IsEmail, IsNotEmpty, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TemplateType } from '@prisma/client';

export class CreateTemplateDto {
  @ApiProperty({ example: 'email_verification', description: 'Name of the template (unique in workspace)' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la plantilla es obligatorio' })
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres' })
  name!: string;

  @ApiProperty({ example: 'EMAIL', enum: TemplateType, description: 'Type of channel: EMAIL or WHATSAPP' })
  @IsEnum(TemplateType, { message: 'El tipo debe ser EMAIL o WHATSAPP' })
  type!: TemplateType;

  @ApiProperty({ example: 'Verifica tu correo electrónico', description: 'Subject of the email (ignored for WhatsApp)', required: false })
  @IsString()
  @IsOptional()
  subject?: string;

  @ApiProperty({ example: '<h1>Hola {{appName}}</h1><p>Tu código es: <b>{{code}}</b></p>', description: 'HTML content of the email template', required: false })
  @IsString()
  @IsOptional()
  bodyHtml?: string;

  @ApiProperty({ example: 'Hola, tu código de verificación para {{appName}} es: {{code}}', description: 'Plain text fallback or WhatsApp body text' })
  @IsString()
  @IsNotEmpty({ message: 'El cuerpo de texto plano es obligatorio' })
  bodyText!: string;
}

export class UpdateTemplateDto {
  @ApiProperty({ example: 'Verifica tu correo electrónico', required: false })
  @IsString()
  @IsOptional()
  subject?: string;

  @ApiProperty({ example: '<h1>Hola {{appName}}</h1><p>Tu código es: <b>{{code}}</b></p>', required: false })
  @IsString()
  @IsOptional()
  bodyHtml?: string;

  @ApiProperty({ example: 'Hola, tu código de verificación para {{appName}} es: {{code}}', required: false })
  @IsString()
  @IsOptional()
  bodyText?: string;
}

export class PreviewTemplateDto {
  @ApiProperty({
    example: {
      code: '123456',
      appName: 'VerifyHub Sandbox',
      expiresInMinutes: 5,
      purpose: 'Registro',
      actionUrl: 'https://example.com/verify?code=123456',
      tenantName: 'VerifyHub Inc.',
      supportEmail: 'support@verifyhub.com',
    },
    description: 'Variables to inject in the template preview',
  })
  @IsOptional()
  variables?: Record<string, any>;
}

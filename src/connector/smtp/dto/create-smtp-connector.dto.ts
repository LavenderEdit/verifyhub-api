import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSmtpConnectorDto {
  @ApiProperty({
    example: 'smtp.mailtrap.io',
    description: 'SMTP server hostname',
  })
  @IsString()
  @IsNotEmpty({ message: 'El host SMTP es obligatorio' })
  host!: string;

  @ApiProperty({
    example: 587,
    description: 'SMTP server port (e.g. 587, 465)',
  })
  @IsNumber()
  @IsNotEmpty({ message: 'El puerto SMTP es obligatorio' })
  @Min(1)
  @Max(65535)
  port!: number;

  @ApiProperty({
    example: false,
    description: 'Whether to use secure connection (SSL/TLS)',
  })
  @IsBoolean()
  @IsOptional()
  secure?: boolean;

  @ApiProperty({
    example: 'smtp_user_id',
    description: 'SMTP authentication username',
  })
  @IsString()
  @IsNotEmpty({ message: 'El usuario de autenticación SMTP es obligatorio' })
  username!: string;

  @ApiProperty({
    example: 'smtp_password_secret',
    description: 'SMTP authentication password',
  })
  @IsString()
  @IsNotEmpty({ message: 'La contraseña SMTP es obligatoria' })
  password!: string;

  @ApiProperty({
    example: 'VerifyHub Alerts',
    description: 'Sender display name',
  })
  @IsString()
  @IsNotEmpty({ message: 'El nombre del remitente (fromName) es obligatorio' })
  fromName!: string;

  @ApiProperty({
    example: 'no-reply@verifyhub.com',
    description: 'Sender email address',
  })
  @IsEmail(
    {},
    { message: 'El correo electrónico del remitente debe ser válido' },
  )
  @IsNotEmpty({ message: 'El correo del remitente (fromEmail) es obligatorio' })
  fromEmail!: string;

  @ApiProperty({
    example: 'support@verifyhub.com',
    description: 'Optional reply-to email address',
    required: false,
  })
  @IsEmail(
    {},
    { message: 'El correo electrónico de respuesta debe ser válido' },
  )
  @IsOptional()
  replyTo?: string;

  @ApiProperty({
    example: 1000,
    description: 'Max sends permitted daily',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  maxDailySends?: number;

  @ApiProperty({
    example: 100,
    description: 'Max sends permitted hourly',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  maxHourlySends?: number;
}

export class UpdateSmtpConnectorDto {
  @ApiProperty({ example: 'smtp.mailtrap.io', required: false })
  @IsString()
  @IsOptional()
  host?: string;

  @ApiProperty({ example: 587, required: false })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiProperty({ example: false, required: false })
  @IsBoolean()
  @IsOptional()
  secure?: boolean;

  @ApiProperty({ example: 'smtp_user_id', required: false })
  @IsString()
  @IsOptional()
  username?: string;

  @ApiProperty({ example: 'smtp_password_secret', required: false })
  @IsString()
  @IsOptional()
  password?: string;

  @ApiProperty({ example: 'VerifyHub Alerts', required: false })
  @IsString()
  @IsOptional()
  fromName?: string;

  @ApiProperty({ example: 'no-reply@verifyhub.com', required: false })
  @IsEmail()
  @IsOptional()
  fromEmail?: string;

  @ApiProperty({ example: 'support@verifyhub.com', required: false })
  @IsEmail()
  @IsOptional()
  replyTo?: string;

  @ApiProperty({ example: 1000, required: false })
  @IsNumber()
  @IsOptional()
  @Min(1)
  maxDailySends?: number;

  @ApiProperty({ example: 100, required: false })
  @IsNumber()
  @IsOptional()
  @Min(1)
  maxHourlySends?: number;
}

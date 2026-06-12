import { IsArray, IsNotEmpty, IsOptional, IsString, IsUrl, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({ example: 'E-commerce API', description: 'Name of the project' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre del proyecto es obligatorio' })
  @MinLength(3, { message: 'El nombre del proyecto debe tener al menos 3 caracteres' })
  name!: string;

  @ApiProperty({ example: ['example.com', 'localhost'], description: 'Allowed domains for redirection allowlist', required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedDomains?: string[];

  @ApiProperty({ example: 'https://api.example.com/webhook', description: 'Webhook URL', required: false })
  @IsUrl({}, { message: 'Debe ser una URL de webhook válida' })
  @IsOptional()
  webhookUrl?: string;
}

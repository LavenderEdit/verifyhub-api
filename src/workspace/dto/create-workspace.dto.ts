import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWorkspaceDto {
  @ApiProperty({ example: 'My Company Workspace', description: 'Name of the workspace' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre del workspace es obligatorio' })
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres' })
  name!: string;
}

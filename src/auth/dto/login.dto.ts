import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@verifyhub.com', description: 'The email address' })
  @IsEmail({}, { message: 'Debe ser un correo electrónico válido' })
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'password123', description: 'The password' })
  @IsNotEmpty()
  password!: string;
}

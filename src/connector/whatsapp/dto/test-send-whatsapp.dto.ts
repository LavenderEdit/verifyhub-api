import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TestSendWhatsappDto {
  @ApiProperty({ description: 'The destination phone number (with country code)', example: '+5491123456789' })
  @IsString()
  @IsNotEmpty()
  to: string;

  @ApiProperty({ description: 'The text message to send', example: 'Hello, this is a test from VerifyHub!' })
  @IsString()
  @IsNotEmpty()
  message: string;
}

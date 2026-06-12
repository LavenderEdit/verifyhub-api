import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWhatsappConnectorDto {
  @ApiProperty({ description: 'The unique friendly name for this WhatsApp connector', example: 'Sales Team WhatsApp' })
  @IsString()
  @IsNotEmpty()
  name: string;
}

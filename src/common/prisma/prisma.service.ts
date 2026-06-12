import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    this.logger.log('Connecting to PostgreSQL database...');
    try {
      await this.$connect();
      this.logger.log('Successfully connected to PostgreSQL.');
    } catch (error: any) {
      this.logger.error('Failed to connect to PostgreSQL database.', error.stack);
      throw error;
    }
  }

  async onModuleDestroy() {
    this.logger.log('Disconnecting from PostgreSQL database...');
    await this.$disconnect();
    this.logger.log('Successfully disconnected from PostgreSQL.');
  }
}

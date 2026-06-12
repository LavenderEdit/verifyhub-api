import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import {
  CreateWebhookEndpointDto,
  UpdateWebhookEndpointDto,
} from './dto/webhook-endpoint.dto.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomBytes } from 'crypto';
import { WebhookEndpoint, WebhookDelivery } from '@prisma/client';

@Injectable()
export class WebhookEndpointService {
  private readonly logger = new Logger(WebhookEndpointService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('webhook_queue') private readonly webhookQueue: Queue,
  ) {}

  async create(
    projectId: string,
    dto: CreateWebhookEndpointDto,
  ): Promise<WebhookEndpoint> {
    // Generate a secure signing secret
    const secret = 'whsec_' + randomBytes(24).toString('hex');

    return this.prisma.webhookEndpoint.create({
      data: {
        projectId,
        url: dto.url,
        secret,
        events: dto.events,
      },
    });
  }

  async findAll(projectId: string): Promise<WebhookEndpoint[]> {
    return this.prisma.webhookEndpoint.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, projectId: string): Promise<WebhookEndpoint> {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { id, projectId },
    });
    if (!endpoint) {
      throw new NotFoundException(
        `Webhook endpoint ${id} not found in this project.`,
      );
    }
    return endpoint;
  }

  async update(
    id: string,
    projectId: string,
    dto: UpdateWebhookEndpointDto,
  ): Promise<WebhookEndpoint> {
    await this.findOne(id, projectId);

    return this.prisma.webhookEndpoint.update({
      where: { id },
      data: {
        url: dto.url,
        events: dto.events,
        enabled: dto.enabled,
      },
    });
  }

  async delete(id: string, projectId: string): Promise<{ message: string }> {
    await this.findOne(id, projectId);

    await this.prisma.webhookEndpoint.delete({
      where: { id },
    });

    return { message: 'Webhook endpoint deleted successfully.' };
  }

  async triggerEvent(
    projectId: string,
    event: string,
    payload: any,
  ): Promise<void> {
    try {
      // Find all active webhooks for this project subscribing to this event or wildcards
      const endpoints = await this.prisma.webhookEndpoint.findMany({
        where: {
          projectId,
          enabled: true,
        },
      });

      const matchedEndpoints = endpoints.filter(
        (ep) => ep.events.includes(event) || ep.events.includes('*'),
      );

      for (const endpoint of matchedEndpoints) {
        // Create pending webhook delivery attempt
        const delivery = await this.prisma.webhookDelivery.create({
          data: {
            endpointId: endpoint.id,
            event,
            payload: payload || {},
            status: 'PENDING',
          },
        });

        // Enqueue as a job
        await this.webhookQueue.add(
          'send_webhook',
          {
            deliveryId: delivery.id,
          },
          {
            attempts: 5,
            backoff: {
              type: 'exponential',
              delay: 5000,
            },
          },
        );

        this.logger.log(
          `Enqueued webhook event ${event} for endpoint ${endpoint.url}`,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Error triggering webhook event ${event} for project ${projectId}: ${error.message}`,
      );
    }
  }

  async replayDelivery(
    deliveryId: string,
    projectId: string,
  ): Promise<{ message: string }> {
    // Ensure the delivery belongs to the project's webhook endpoint
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { endpoint: true },
    });

    if (!delivery || delivery.endpoint.projectId !== projectId) {
      throw new NotFoundException(
        `Webhook delivery ${deliveryId} not found in this project.`,
      );
    }

    // Reset status and queue
    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'PENDING',
        attempt: 1,
        statusCode: null,
        response: null,
      },
    });

    await this.webhookQueue.add(
      'send_webhook',
      {
        deliveryId: delivery.id,
      },
      {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    );

    return { message: 'Webhook delivery re-enqueued for replay.' };
  }

  async findDeliveries(
    endpointId: string,
    projectId: string,
  ): Promise<WebhookDelivery[]> {
    await this.findOne(endpointId, projectId);
    return this.prisma.webhookDelivery.findMany({
      where: { endpointId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}

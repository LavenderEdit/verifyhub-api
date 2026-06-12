import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { createHmac } from 'crypto';

@Processor('webhook_queue')
@Injectable()
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    if (job.name !== 'send_webhook') {
      return;
    }

    const { deliveryId } = job.data;

    // 1. Fetch Delivery Attempt and Endpoint
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { endpoint: true },
    });

    if (!delivery) {
      this.logger.error(
        `Webhook delivery ${deliveryId} not found in database.`,
      );
      return;
    }

    const { endpoint } = delivery;
    if (!endpoint || !endpoint.enabled) {
      this.logger.warn(
        `Webhook endpoint for delivery ${deliveryId} is missing or disabled.`,
      );
      return;
    }

    // 2. Prepare payload and signature
    const timestamp = Date.now().toString();
    const body = JSON.stringify({
      id: delivery.id,
      event: delivery.event,
      createdAt: delivery.createdAt,
      payload: delivery.payload,
    });

    // Sign formatted as timestamp.body
    const signature = createHmac('sha256', endpoint.secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');

    const currentAttempt = job.attemptsMade + 1;

    try {
      this.logger.log(
        `Sending webhook event ${delivery.event} to ${endpoint.url} (Attempt ${currentAttempt}/5)`,
      );

      // 3. Make HTTP request with timeout
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-verifyhub-signature': signature,
          'x-verifyhub-timestamp': timestamp,
          'x-verifyhub-delivery-id': delivery.id,
        },
        body,
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      const responseText = await response.text();
      const statusCode = response.status;

      if (response.ok) {
        // Success
        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'SUCCESS',
            statusCode,
            response: responseText.slice(0, 1000),
            attempt: currentAttempt,
          },
        });
        this.logger.log(
          `Webhook delivery ${delivery.id} succeeded (HTTP ${statusCode}).`,
        );
      } else {
        // HTTP Error
        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'FAILED',
            statusCode,
            response: responseText.slice(0, 1000),
            attempt: currentAttempt,
          },
        });
        throw new Error(`Webhook returned status code ${statusCode}`);
      }
    } catch (error: any) {
      this.logger.error(
        `Webhook delivery ${delivery.id} failed: ${error.message}`,
      );

      // Update delivery log
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'FAILED',
          response: error.message,
          attempt: currentAttempt,
        },
      });

      // Re-throw so BullMQ performs retry with backoff
      throw error;
    }
  }
}

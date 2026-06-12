// Mock nodemailer at the very top before any imports
jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    verify: jest.fn().mockResolvedValue(true),
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
  }),
}));

// Mock isomorphic-dompurify to prevent ESM import issues in Jest
jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: {
    sanitize: (val: string) => val,
  },
}));

// Mock whatsapp-web.js to prevent launching actual puppeteer in tests
jest.mock('whatsapp-web.js', () => {
  class MockClient {
    private handlers: { [key: string]: Function } = {};
    public info = { pushname: 'Mocked WhatsApp Client' };

    on(event: string, callback: Function) {
      this.handlers[event] = callback;
      if (event === 'ready') {
        setTimeout(() => {
          if (this.handlers['ready']) this.handlers['ready']();
        }, 10);
      }
      if (event === 'qr') {
        setTimeout(() => {
          if (this.handlers['qr']) this.handlers['qr']('mocked-qr-code-string');
        }, 5);
      }
    }

    async initialize() {
      return Promise.resolve();
    }

    async getState() {
      return Promise.resolve('CONNECTED');
    }

    async sendMessage(to: string, msg: string) {
      return Promise.resolve({ id: { id: 'mock-msg-id' } });
    }

    async logout() {
      return Promise.resolve();
    }

    async destroy() {
      return Promise.resolve();
    }
  }

  class MockLocalAuth {
    constructor(public options: any) {}
  }

  return {
    Client: MockClient,
    LocalAuth: MockLocalAuth,
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import fastifyCookie from '@fastify/cookie';
import { randomUUID } from 'crypto';
import { VersioningType } from '@nestjs/common';

describe('VerifyHub API (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false })
    );

    // Register cookies
    await app.register(fastifyCookie, {
      secret: 'test-cookie-secret-very-long-at-least-32-chars',
    });

    // Enable API versioning /v1
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    prisma = app.get(PrismaService);

    // Clean database before starting
    await prisma.refreshToken.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.project.deleteMany();
    await prisma.workspaceMember.deleteMany();
    await prisma.workspace.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.refreshToken.deleteMany();
      await prisma.apiKey.deleteMany();
      await prisma.project.deleteMany();
      await prisma.workspaceMember.deleteMany();
      await prisma.workspace.deleteMany();
      await prisma.user.deleteMany();
      await prisma.$disconnect();
    }
    if (app) {
      await app.close();
    }
  });

  let accessToken: string;
  let workspaceId: string;
  let projectId: string;
  let apiKey: string;
  let smtpConnectorId: string;
  let templateId: string;
  let challengeId: string;
  let sandboxCode: string;

  const testEmail = `admin-${randomUUID()}@verifyhub.com`;
  const testPassword = 'Password123!';

  // --- FASE 2: AUTH & MULTI-TENANCY TESTS ---

  it('1. Register a new user', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        email: testEmail,
        password: testPassword,
      })
      .expect(201);

    expect(response.body.email).toBe(testEmail);
    expect(response.body.id).toBeDefined();
  });

  it('2. Login user and return JWT + set Cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
      })
      .expect(200);

    expect(response.body.accessToken).toBeDefined();
    accessToken = response.body.accessToken;
  });

  it('3. Create a workspace', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/workspaces')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Test Workspace',
      })
      .expect(201);

    expect(response.body.name).toBe('Test Workspace');
    workspaceId = response.body.id;
  });

  it('4. Create a project inside the workspace', async () => {
    const response = await request(app.getHttpServer())
      .post(`/v1/workspaces/${workspaceId}/projects`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Test Project',
        allowedDomains: ['localhost'],
      })
      .expect(201);

    expect(response.body.name).toBe('Test Project');
    projectId = response.body.id;
  });

  it('5. Create an API Key for the project', async () => {
    const response = await request(app.getHttpServer())
      .post(`/v1/projects/${projectId}/api-keys`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Test M2M Key',
        scopes: ['challenge:create', 'challenge:verify', 'challenge:read'],
      })
      .expect(201);

    expect(response.body.plainKey).toContain('vh_live_');
    apiKey = response.body.plainKey;
  });

  // --- FASE 4: SMTP CONNECTORS & TEMPLATES ---

  it('6. Create SMTP connector', async () => {
    const response = await request(app.getHttpServer())
      .post(`/v1/connectors/smtp?workspaceId=${workspaceId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        host: 'smtp.mailtrap.io',
        port: 587,
        secure: false,
        username: 'smtp-username',
        password: 'smtp-password',
        fromName: 'VerifyHub Test',
        fromEmail: 'test@verifyhub.com',
      })
      .expect(201);

    expect(response.body.host).toBe('smtp.mailtrap.io');
    expect(response.body.passwordEncrypted).toBeUndefined(); // Should be sanitized
    smtpConnectorId = response.body.id;
  });

  it('7. Test SMTP connector connection (Mocked success)', async () => {
    const response = await request(app.getHttpServer())
      .post(`/v1/connectors/smtp/${smtpConnectorId}/test?workspaceId=${workspaceId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.message).toContain('SMTP exitosa');
  });

  it('8. Create Email Template', async () => {
    const response = await request(app.getHttpServer())
      .post(`/v1/templates?workspaceId=${workspaceId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'test_email_otp',
        type: 'EMAIL',
        subject: 'Código: {{code}}',
        bodyHtml: '<h1>Hola {{appName}}</h1><p>Código: {{code}}</p>',
        bodyText: 'Hola tu código de verificación para {{appName}} es {{code}}',
      })
      .expect(201);

    expect(response.body.name).toBe('test_email_otp');
    templateId = response.body.id;
  });

  it('9. Preview Email Template', async () => {
    const response = await request(app.getHttpServer())
      .post(`/v1/templates/${templateId}/preview?workspaceId=${workspaceId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        variables: {
          code: '999999',
          appName: 'VerifyHub E2E',
        },
      })
      .expect(200);

    expect(response.body.subject).toContain('999999');
    expect(response.body.html).toContain('VerifyHub E2E');
  });

  // --- DELIVERY PLANE (M2M CHALLENGES) ---

  it('10. Create Challenge (M2M API Key authorized)', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/challenges')
      .set('x-api-key', apiKey)
      .send({
        channel: 'EMAIL',
        purpose: 'VERIFY_EMAIL',
        destination: 'test-recipient@verifyhub.com',
        templateName: 'test_email_otp',
      })
      .expect(201);

    expect(response.body.id).toBeDefined();
    expect(response.body.status).toBe('QUEUED');
    expect(response.body.sandboxCode).toBeDefined(); // Visible because NODE_ENV=test/development
    
    challengeId = response.body.id;
    sandboxCode = response.body.sandboxCode;
  });

  it('11. Rate limit check: requesting again immediately triggers cooldown 429', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/challenges')
      .set('x-api-key', apiKey)
      .send({
        channel: 'EMAIL',
        purpose: 'VERIFY_EMAIL',
        destination: 'test-recipient@verifyhub.com',
        templateName: 'test_email_otp',
      })
      .expect(429);

    expect(response.body.message).toContain('espere 60 segundos');
  });

  it('12. Verify Challenge with INCORRECT code', async () => {
    const response = await request(app.getHttpServer())
      .post(`/v1/challenges/${challengeId}/verify`)
      .set('x-api-key', apiKey)
      .send({
        code: '000000', // Wrong code
      })
      .expect(400);

    expect(response.body.message).toContain('incorrecto');
  });

  it('13. Verify Challenge with CORRECT code', async () => {
    const response = await request(app.getHttpServer())
      .post(`/v1/challenges/${challengeId}/verify`)
      .set('x-api-key', apiKey)
      .send({
        code: sandboxCode, // Correct code
      })
      .expect(200);

    expect(response.body.verified).toBe(true);
  });

  let whatsappConnectorId: string;

  it('14. Create WhatsApp connector', async () => {
    const response = await request(app.getHttpServer())
      .post(`/v1/connectors/whatsapp?workspaceId=${workspaceId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Main Support WA',
      })
      .expect(201);

    expect(response.body.name).toBe('Main Support WA');
    whatsappConnectorId = response.body.id;
  });

  it('15. Get WhatsApp connector status', async () => {
    const response = await request(app.getHttpServer())
      .get(`/v1/connectors/whatsapp/${whatsappConnectorId}/status?workspaceId=${workspaceId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.id).toBe(whatsappConnectorId);
    expect(response.body.name).toBe('Main Support WA');
    expect(response.body.status).toBeDefined();
  });

  it('16. Restart WhatsApp connector', async () => {
    const response = await request(app.getHttpServer())
      .post(`/v1/connectors/whatsapp/${whatsappConnectorId}/restart?workspaceId=${workspaceId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.message).toContain('restart initiated');
  });

  it('17. Create WhatsApp Template', async () => {
    const response = await request(app.getHttpServer())
      .post(`/v1/templates?workspaceId=${workspaceId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'test_whatsapp_otp',
        type: 'WHATSAPP',
        bodyText: 'Hola tu código de WhatsApp es {{code}}',
      })
      .expect(201);

    expect(response.body.name).toBe('test_whatsapp_otp');
  });

  it('18. Test sending message', async () => {
    await prisma.whatsappConnector.update({
      where: { id: whatsappConnectorId },
      data: { status: 'READY' },
    });

    const response = await request(app.getHttpServer())
      .post(`/v1/connectors/whatsapp/${whatsappConnectorId}/test-send?workspaceId=${workspaceId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        to: '+5491123456789',
        message: 'Hello WhatsApp test!',
      })
      .expect(200);

    expect(response.body.messageId).toBeDefined();
  });

  it('19. Create WhatsApp Challenge (M2M API Key authorized)', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/challenges')
      .set('x-api-key', apiKey)
      .send({
        channel: 'WHATSAPP',
        purpose: 'VERIFY_PHONE',
        destination: '+5491123456789',
        templateName: 'test_whatsapp_otp',
      })
      .expect(201);

    expect(response.body.id).toBeDefined();
    expect(response.body.status).toBe('QUEUED');
    expect(response.body.sandboxCode).toBeDefined();
  });

  it('20. Delete WhatsApp connector', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/v1/connectors/whatsapp/${whatsappConnectorId}?workspaceId=${workspaceId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.message).toContain('deleted successfully');
  });
});

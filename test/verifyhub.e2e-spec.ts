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

    // Register cookies in testing Fastify instance
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

    // Clean database before starting test cases
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

  const testEmail = `admin-${randomUUID()}@verifyhub.com`;
  const testPassword = 'Password123!';

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

    const cookies = response.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toContain('refreshToken');
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
    expect(response.body.id).toBeDefined();
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
    expect(response.body.workspaceId).toBe(workspaceId);
    expect(response.body.id).toBeDefined();
    projectId = response.body.id;
  });

  it('5. Create an API Key for the project', async () => {
    const response = await request(app.getHttpServer())
      .post(`/v1/projects/${projectId}/api-keys`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Test M2M Key',
        scopes: ['challenge:create', 'challenge:verify'],
      })
      .expect(201);

    expect(response.body.name).toBe('Test M2M Key');
    expect(response.body.plainKey).toBeDefined();
    expect(response.body.plainKey).toContain('vh_live_');
    apiKey = response.body.plainKey;
  });
});

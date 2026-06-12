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
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET)', async () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});

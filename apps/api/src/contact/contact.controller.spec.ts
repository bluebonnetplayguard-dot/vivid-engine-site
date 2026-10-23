import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { ContactService } from './contact.service';

describe('POST /api/contact', () => {
  let app: INestApplication;
  const submit = jest.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ContactService)
      .useValue({ submit })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => submit.mockClear());

  it('accepts a valid submission', async () => {
    await request(app.getHttpServer())
      .post('/api/contact')
      .send({ name: 'Sam', email: 'sam@example.com', message: 'Need a new site', service: 'web-design' })
      .expect(202, { ok: true });
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Sam', service: 'web-design' }));
  });

  it('rejects a missing email with a readable message', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/contact')
      .send({ name: 'Sam', message: 'Hi' })
      .expect(400);
    expect(res.body.message).toContain('Please enter a valid email address.');
    expect(submit).not.toHaveBeenCalled();
  });

  it('strips unknown fields', async () => {
    await request(app.getHttpServer())
      .post('/api/contact')
      .send({ name: 'Sam', email: 'sam@example.com', message: 'Hi', admin: true })
      .expect(202);
    expect(submit.mock.calls[0][0]).not.toHaveProperty('admin');
  });

  it('reports health', () => request(app.getHttpServer()).get('/api/health').expect(200, { status: 'ok' }));
});

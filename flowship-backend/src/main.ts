import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: [
      'http://localhost:4200',
      'https://flowship-admin.web.app',
    ],
    methods: [
      'GET',
      'POST',
      'PATCH',
      'PUT',
      'DELETE',
      'OPTIONS',
    ],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-api-key',
    ],
    credentials: false,

  });

  const port = Number(process.env.PORT) || 3000;

  await app.listen(port, '0.0.0.0');

  console.log(`FlowShip API is running on port ${port}`);
}

bootstrap().catch((error: unknown) => {
  console.error('Failed to start FlowShip API:', error);
  process.exit(1);
});
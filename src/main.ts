// main.ts
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Express } from 'express';

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);

    const port = Number(process.env.PORT) || 5000;
    const host = process.env.HOST || '127.0.0.1';
    const frontendOrigin = process.env.FRONTEND_URL || 'https://prenup-weld.vercel.app';
    const isProd = process.env.NODE_ENV === 'production';

    const expressApp = app.getHttpAdapter().getInstance() as Express;

    if (process.env.TRUST_PROXY === 'true') {
      expressApp.set('trust proxy', 1);
    }

    expressApp.use(
      helmet({
        contentSecurityPolicy: isProd ? undefined : false,
      }),
    );

    expressApp.use(cookieParser());

    app.enableCors({
       origin: [frontendOrigin, 'https://app.letsprenup.co.uk'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    });

    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }),
    );

    const globalPrefix = process.env.GLOBAL_PREFIX || 'api';
    app.setGlobalPrefix(globalPrefix);

    const swaggerConfig = new DocumentBuilder()
      .setTitle('Prenup API')
      .setDescription('Prenup backend APIs')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        'bearer-jwt',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${globalPrefix}/docs`, app, document);

    await app.listen(port, host);
    console.log(`Server running on ${await app.getUrl()}`);
  } catch (err) {
    console.error('Failed to bootstrap application', err);
    process.exit(1);
  }
}

bootstrap();

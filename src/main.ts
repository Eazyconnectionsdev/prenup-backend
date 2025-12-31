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

    // --- config ---
    const port = Number(process.env.PORT) || 5000;
    const host = process.env.HOST || '127.0.0.1';
    const frontendOrigin = process.env.FRONTEND_URL || 'http://localhost:3000';
    const isProd = process.env.NODE_ENV === 'production';

    // Get underlying Express instance (so we can call Express-specific APIs)
    const expressApp = app.getHttpAdapter().getInstance() as Express;

    // If your app runs behind a proxy (nginx, heroku, etc.), set trust proxy on the express app:
    if (process.env.TRUST_PROXY === 'true') {
      // first-hop proxy
      expressApp.set('trust proxy', 1);
    }

    // --- security middlewares ---
    // Use helmet; disable CSP in dev to avoid local asset problems
    expressApp.use(
      helmet({
        contentSecurityPolicy: isProd ? undefined : false,
      }),
    );

    // parse cookies so req.cookies is available for your JwtStrategy extractor
    expressApp.use(cookieParser());

    // --- CORS ---
    app.enableCors({
      origin: frontendOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    });

    // --- global pipes / prefix / swagger ---
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

    // --- start server ---
    await app.listen(port, host);
    console.log(`Server running on ${await app.getUrl()}`);
  } catch (err) {
    console.error('Failed to bootstrap application', err);
    process.exit(1);
  }
}

bootstrap();

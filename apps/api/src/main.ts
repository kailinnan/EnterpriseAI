import 'dotenv/config';
import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { json } from 'express';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './modules/app.module.js';
const app = await NestFactory.create(AppModule, {
  cors: { origin: process.env.WEB_URL ?? 'http://localhost:3000', credentials: true },
  logger: false,
});
app.use(cookieParser());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(json({ limit: '1mb' }));
app.useGlobalPipes(
  new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
);
app.setGlobalPrefix('api/v1', { exclude: ['health/live', 'health/ready'] });
const doc = SwaggerModule.createDocument(
  app,
  new DocumentBuilder().setTitle('Enterprise AI Hub').setVersion('1').addBearerAuth().build(),
);
SwaggerModule.setup('api/docs', app, doc);
await app.listen(3001);

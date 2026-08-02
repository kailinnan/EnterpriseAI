import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard, RolesGuard, ScopesGuard } from '../common/auth.js';
import { ObservabilityInterceptor } from '../common/observability.js';
import { ContextMiddleware } from '../common/context.middleware.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { TenantController } from './tenant.controller.js';
import { ModelController } from './model.controller.js';
import { ModelService } from './model.service.js';
import { KnowledgeController } from './knowledge.controller.js';
import { KnowledgeService } from './knowledge.service.js';
import { RetrievalController } from './retrieval.controller.js';
import { RetrievalService } from './retrieval.service.js';
import { AssistantController } from './assistant.controller.js';
import { AssistantService } from './assistant.service.js';
import { HealthController } from './health.controller.js';
import { ToolService } from './tool.service.js';
import { AgentService } from './agent.service.js';
import { ApprovalService } from './approval.service.js';
import { AgentController } from './agent.controller.js';
import { WorkflowService } from './workflow.service.js';
import { WorkflowController } from './workflow.controller.js';
import { QuotaService, QuotaGuard } from './quota.service.js';
import { QuotaController } from './quota.controller.js';
import { OperationsController } from './operations.controller.js';
import { DataLifecycleController } from './data-lifecycle.controller.js';
import { EvaluationService } from './evaluation.service.js';
import { EvaluationController } from './evaluation.controller.js';
import { ManagementController } from './management.controller.js';
import { S3StorageAdapter } from './storage.adapter.js';
@Module({
  imports: [JwtModule.register({})],
  controllers: [
    HealthController,
    AuthController,
    TenantController,
    ModelController,
    KnowledgeController,
    RetrievalController,
    AssistantController,
    AgentController,
    WorkflowController,
    QuotaController,
    OperationsController,
    DataLifecycleController,
    EvaluationController,
    ManagementController,
  ],
  providers: [
    AuthService,
    ModelService,
    KnowledgeService,
    RetrievalService,
    AssistantService,
    ToolService,
    AgentService,
    ApprovalService,
    WorkflowService,
    QuotaService,
    EvaluationService,
    S3StorageAdapter,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ScopesGuard },
    { provide: APP_GUARD, useClass: QuotaGuard },
    { provide: APP_INTERCEPTOR, useClass: ObservabilityInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ContextMiddleware).forRoutes('*');
  }
}

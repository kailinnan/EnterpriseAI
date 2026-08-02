import { Body, Controller, Delete, Get } from '@nestjs/common';
import { z } from 'zod';
import { db } from '@hub/db';
import { S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal, RequireRoles, type Principal } from '../common/auth.js';
@ApiTags('data-lifecycle')
@Controller('data')
export class DataLifecycleController {
  @ApiOperation({ summary: '导出租户业务数据' })
  @RequireRoles('owner', 'admin')
  @Get('export')
  async export(@CurrentPrincipal() p: Principal) {
    const [
      tenant,
      members,
      assistants,
      knowledgeBases,
      documents,
      conversations,
      messages,
      agentRuns,
      toolCalls,
      workflowRuns,
      usageRecords,
      apiKeys,
      auditLogs,
    ] = await Promise.all([
      db()`select id,name,slug,status,created_at from tenants where id=${p.tenantId}`,
      db()`select u.email,u.display_name,tm.role from tenant_members tm join users u on u.id=tm.user_id where tm.tenant_id=${p.tenantId}`,
      db()`select * from assistants where tenant_id=${p.tenantId}`,
      db()`select * from knowledge_bases where tenant_id=${p.tenantId}`,
      db()`select id,knowledge_base_id,file_name,mime_type,file_size,sha256,parse_status,index_status,version,created_at from documents where tenant_id=${p.tenantId}`,
      db()`select * from conversations where tenant_id=${p.tenantId}`,
      db()`select * from messages where tenant_id=${p.tenantId}`,
      db()`select * from agent_runs where tenant_id=${p.tenantId}`,
      db()`select * from tool_calls where tenant_id=${p.tenantId}`,
      db()`select * from workflow_runs where tenant_id=${p.tenantId}`,
      db()`select * from usage_records where tenant_id=${p.tenantId}`,
      db()`select id,name,prefix,scopes,expires_at,last_used_at,revoked_at,created_at from api_keys where tenant_id=${p.tenantId}`,
      db()`select * from audit_logs where tenant_id=${p.tenantId}`,
    ]);
    return {
      exportedAt: new Date().toISOString(),
      tenant,
      members,
      assistants,
      knowledgeBases,
      documents,
      conversations,
      messages,
      agentRuns,
      toolCalls,
      workflowRuns,
      usageRecords,
      apiKeys,
      auditLogs,
    };
  }
  @ApiOperation({ summary: '永久删除租户数据库与对象存储数据' })
  @RequireRoles('owner')
  @Delete('tenant')
  async remove(@Body() body: unknown, @CurrentPrincipal() p: Principal) {
    const { confirmation } = z
      .object({ confirmation: z.literal('DELETE TENANT DATA') })
      .parse(body);
    if (confirmation !== 'DELETE TENANT DATA') throw new Error('CONFIRMATION_REQUIRED');
    const objects = await db()`select object_key from documents where tenant_id=${p.tenantId}`;
    if (objects.length) {
      const s3 = new S3Client({
        endpoint: String(process.env.S3_ENDPOINT),
        region: process.env.S3_REGION ?? 'us-east-1',
        forcePathStyle: true,
        credentials: {
          accessKeyId: String(process.env.S3_ACCESS_KEY),
          secretAccessKey: String(process.env.S3_SECRET_KEY),
        },
      });
      for (let i = 0; i < objects.length; i += 1000)
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: String(process.env.S3_BUCKET),
            Delete: {
              Objects: objects.slice(i, i + 1000).map((x) => ({ Key: String(x.object_key) })),
              Quiet: true,
            },
          }),
        );
    }
    await db()`delete from tenants where id=${p.tenantId}`;
    return { deleted: true };
  }
}

import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const ProjectContext = createParamDecorator(
  (data: 'id' | 'workspaceId' | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const project = request.project;
    const workspaceId = request.workspaceId;

    if (!project) return null;
    if (data === 'id') return project.id;
    if (data === 'workspaceId') return workspaceId;
    return { project, workspaceId };
  },
);

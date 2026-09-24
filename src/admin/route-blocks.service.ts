import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RouteBlock } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateRouteBlockDto,
  UpdateRouteBlockDto,
  RouteBlocksQueryDto,
} from './dto/route-block.dto';

@Injectable()
export class RouteBlocksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: RouteBlocksQueryDto) {
    const { page = 1, limit = 20, ...where } = query;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.routeBlock.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.routeBlock.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async get(id: string) {
    const block = await this.prisma.routeBlock.findUnique({ where: { id } });
    if (!block) throw new NotFoundException('Route block not found.');
    return block;
  }

  create(dto: CreateRouteBlockDto, actorAdminId: string) {
    return this.mutate(async (tx) => {
      const block = await tx.routeBlock.create({
        data: { ...dto, createdByAdminId: actorAdminId },
      });
      await tx.routeBlockAudit.create({
        data: {
          routeBlockId: block.id,
          actorAdminId,
          action: 'CREATE',
          after: this.snapshot(block),
        },
      });
      return block;
    });
  }

  update(id: string, dto: UpdateRouteBlockDto, actorAdminId: string) {
    return this.mutate(async (tx) => {
      // Serialize updates so the audit's old state is the actual previous state.
      await tx.$queryRaw`SELECT "id" FROM "route_blocks" WHERE "id" = ${id} FOR UPDATE`;
      const before = await tx.routeBlock.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Route block not found.');
      const block = await tx.routeBlock.update({ where: { id }, data: dto });
      await tx.routeBlockAudit.create({
        data: {
          routeBlockId: id,
          actorAdminId,
          action: 'UPDATE',
          before: this.snapshot(before),
          after: this.snapshot(block),
        },
      });
      return block;
    });
  }

  private snapshot(block: RouteBlock): Prisma.InputJsonObject {
    return {
      fromCountryCode: block.fromCountryCode,
      toCountryCode: block.toCountryCode,
      transportType: block.transportType,
      reason: block.reason,
      isActive: block.isActive,
    };
  }

  private async mutate<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(operation);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'ROUTE_BLOCK_DUPLICATE',
          message: 'An equivalent active route block already exists.',
        });
      }
      throw error;
    }
  }
}

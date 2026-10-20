import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import { hashPassword } from "@/lib/password";
import { UserRole } from "@/generated/prisma/enums";

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  phone: z.string().optional(),
  employeeCode: z.string().optional(),
});

export async function POST(req: Request) {
  const authz = await requirePermission("sales-team:manage");
  if (!authz.ok) return authz.response;
  const { session } = authz;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const exists = await prisma.user.findUnique({ where: { email: d.email } });
  if (exists) {
    return NextResponse.json({ error: "Email taken" }, { status: 409 });
  }
  const passwordHash = await hashPassword(d.password);
  const user = await prisma.user.create({
    data: {
      email: d.email,
      passwordHash,
      name: d.name,
      phone: d.phone,
      role: UserRole.SALES,
      salesProfile: {
        create: {
          createdById: session.user.id,
          employeeCode: d.employeeCode,
        },
      },
    },
    include: { salesProfile: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "CREATE_SALES_USER",
      entity: "User",
      entityId: user.id,
    },
  });

  return NextResponse.json({ userId: user.id });
}

export async function GET() {
  const authz = await requirePermission("sales-team:manage");
  if (!authz.ok) return authz.response;
  const users = await prisma.user.findMany({
    where: { role: UserRole.SALES },
    // Never return password hashes.
    select: { id: true, email: true, name: true, createdAt: true, salesProfile: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ salesUsers: users });
}

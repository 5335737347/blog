import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import crypto from "crypto";

// GET /api/auth/key — get current user's API key
export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const u = await prisma.user.findUnique({ where: { id: user.userId } });
  return NextResponse.json({ apiKey: u?.apiKey || null });
}

// POST /api/auth/key — regenerate API key
export async function POST() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const apiKey = `kp_${crypto.randomBytes(24).toString("hex")}`;

  await prisma.user.update({
    where: { id: user.userId },
    data: { apiKey },
  });

  return NextResponse.json({ apiKey });
}

import { NextResponse } from "next/server";
import { lerLinhas, redis } from "../../lib/grupos";

export const dynamic = "force-dynamic";

export async function GET() {
  const { linhas, ultimosEventos } = await lerLinhas(redis());
  return NextResponse.json({ linhas, ultimosEventos });
}

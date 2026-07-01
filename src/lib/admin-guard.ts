import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";

/**
 * API-route admin guard. Returns the user, or a NextResponse to short-circuit.
 * Usage: const g = await guardAdmin(); if (g instanceof NextResponse) return g;
 */
export async function guardAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return user;
}

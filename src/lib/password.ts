import { compare, hash } from "bcryptjs";

const ROUNDS = 12;

export async function hashPassword(plain: string) {
  return hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, passwordHash: string) {
  return compare(plain, passwordHash);
}

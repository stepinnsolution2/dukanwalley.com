// Gives every vendor a username (from the store name, e.g. "rawayat.com.pk" → "rawayat") and sets
// one password for all of them, so each store can sign in to its seller panel.
//   npx tsx scripts/set-vendor-logins.ts <password> [--dry-run]
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";

const password = process.argv[2];
const DRY = process.argv.includes("--dry-run");

const usernameFor = (storeName: string) =>
  storeName
    .toLowerCase()
    .replace(/\.(com|net|org)(\.pk)?$|\.pk$/, "")
    .replace(/[^a-z0-9]+/g, "");

async function main() {
  if (!password || password.length < 8) throw new Error("Give a password of at least 8 characters");
  const vendors = await prisma.vendorProfile.findMany({ select: { storeName: true, userId: true, user: { select: { username: true } } }, orderBy: { createdAt: "asc" } });
  const hash = await hashPassword(password);
  const used = new Set((await prisma.user.findMany({ where: { username: { not: null } }, select: { username: true, id: true } })).map((u) => `${u.username}|${u.id}`));
  for (const v of vendors) {
    let username = v.user.username ?? usernameFor(v.storeName);
    // Another account already using it: add a number.
    for (let n = 2; [...used].some((x) => x.startsWith(`${username}|`) && !x.endsWith(`|${v.userId}`)); n++) username = `${usernameFor(v.storeName)}${n}`;
    used.add(`${username}|${v.userId}`);
    if (!DRY) await prisma.user.update({ where: { id: v.userId }, data: { username, passwordHash: hash } });
    console.log(`${v.storeName.padEnd(28)} username: ${username}`);
  }
  console.log(DRY ? "(dry run, nothing saved)" : `password set for ${vendors.length} vendors`);
}

main().finally(() => prisma.$disconnect());

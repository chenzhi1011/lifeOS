import { randomBytes, createHash } from "node:crypto";

const name = process.argv[2] ?? "custom-gpt";
const userId = process.argv[3] ?? "USER_ID_HERE";
const token = `los_${randomBytes(24).toString("base64url")}`;
const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");

console.log(JSON.stringify({ name, userId, token, tokenHash }, null, 2));
console.log("");
console.log("Insert tokenHash into Supabase action_credentials. Give token to the Custom GPT owner once.");

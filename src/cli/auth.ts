import readline from "node:readline";
import { writeStoredSession } from "../utils/auth-store.js";
import { MobbinAuth } from "../services/auth.js";
import { SUPABASE_COOKIE_PREFIX } from "../constants.js";

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

export async function runAuthFlow(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log("\nMobbin MCP Authentication\n");
    console.log("1. Open mobbin.com and log in");
    console.log("2. Open the browser console (Cmd+Option+J)");
    console.log("3. Paste one of these and press Enter:\n");
    console.log(`   copy(localStorage.getItem("${SUPABASE_COOKIE_PREFIX}"))`);
    console.log("   or");
    console.log("   copy(document.cookie)\n");
    console.log("4. Paste the copied value below:\n");

    const authInput = (await prompt(rl, "Session input: ")).trim();
    if (!authInput) {
      console.error("No auth input provided.");
      process.exit(1);
    }

    const auth = MobbinAuth.fromCookie(authInput);
    const session = auth.getSession();
    writeStoredSession(session);

    console.log(
      "\nAuthenticated successfully! Session saved to ~/.mobbin-mcp/auth.json" +
        "\nYou can now use the MCP server without setting MOBBIN_AUTH_COOKIE.\n",
    );
  } finally {
    rl.close();
  }
}

/**
 * Generates a passphrase hash for DAMZ_PASS_HASH or DAS_PASS_HASH.
 * The passphrase is read without echo and never written anywhere; only the hash is printed.
 * Usage: npm run hash-pass
 */
import { hashPassphrase, verifyPassphrase } from "../netlify/lib/password.ts";

const MIN_LENGTH = 12;

function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) {
      reject(new Error("Run this in an interactive terminal so the passphrase isn't echoed or piped."));
      return;
    }
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          stdout.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const first = await askHidden("Passphrase: ");
  if (first.length < MIN_LENGTH) {
    process.stderr.write(`Use at least ${MIN_LENGTH} characters. Nothing was generated.\n`);
    process.exit(1);
  }
  const second = await askHidden("Again: ");
  if (first !== second) {
    process.stderr.write("The two entries differ. Nothing was generated.\n");
    process.exit(1);
  }
  const hash = await hashPassphrase(first);
  if (!(await verifyPassphrase(first, hash))) throw new Error("Self-check failed");
  process.stdout.write(`\nPaste this into the Netlify UI as DAMZ_PASS_HASH or DAS_PASS_HASH:\n\n${hash}\n\n`);
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});

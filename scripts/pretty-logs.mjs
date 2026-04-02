import readline from "node:readline";

const levelColor = {
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m"
};
const reset = "\x1b[0m";

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const parsed = JSON.parse(trimmed);
    const level = typeof parsed.level === "string" ? parsed.level : "info";
    const color = levelColor[level] ?? "\x1b[37m";
    const message = [
      `[${parsed.timestamp ?? new Date().toISOString()}]`,
      `[${String(parsed.service ?? "unknown").toUpperCase()}]`,
      `[${String(level).toUpperCase()}]`,
      parsed.event ? String(parsed.event) : "",
      parsed.status ? `status=${parsed.status}` : "",
      parsed.route ? `route="${parsed.route}"` : "",
      parsed.action ? `action=${parsed.action}` : "",
      parsed.jobId ? `jobId=${parsed.jobId}` : "",
      parsed.userId ? `userId=${parsed.userId}` : "",
      typeof parsed.durationMs === "number" ? `durationMs=${parsed.durationMs}` : "",
      parsed.errorType ? `errorType=${parsed.errorType}` : "",
      parsed.errorMessage ? `error="${parsed.errorMessage}"` : ""
    ]
      .filter(Boolean)
      .join(" ");
    console.log(`${color}${message}${reset}`);
  } catch {
    console.log(line);
  }
});

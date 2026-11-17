import { spawn } from "node:child_process";
import { buildCore } from "./build-core.mjs";

const binary = await buildCore();
const child = spawn(binary, [], { stdio: "inherit", windowsHide: true, env: process.env });
child.once("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.once("exit", (code) => { process.exitCode = code ?? 1; });

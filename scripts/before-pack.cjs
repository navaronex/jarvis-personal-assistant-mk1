const { readFileSync, writeFileSync, existsSync } = require("node:fs");
const path = require("node:path");
module.exports = async (context) => {
  const root = context.packager.projectDir;
  for (const file of [
    "runtime/node.exe",
    "runtime/LICENSE",
    "build/icon.ico",
  ]) {
    if (!existsSync(path.join(root, file)))
      throw Error(
        `Falta ${file}. Ejecuta npm run prepare:runtime y scripts/make-icon.ps1.`,
      );
  }
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  // Copia separada: extraResources no debe retirar package.json del archivo app.asar.
  writeFileSync(
    path.join(root, "build/backend-package.json"),
    JSON.stringify({ name: pkg.name, version: pkg.version, type: "module" }),
  );
};

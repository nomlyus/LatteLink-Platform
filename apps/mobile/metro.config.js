const fs = require("fs");
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

// pnpm can link packages from another git worktree, so Metro needs to watch
// those realpaths explicitly instead of assuming everything lives under the repo root.
function collectExternalDependencyTargets(nodeModulesDir) {
  if (!fs.existsSync(nodeModulesDir)) {
    return {
      nodeModulesRoots: [],
      packageRoots: []
    };
  }

  const nodeModulesRoots = new Set();
  const packageRoots = new Set();

  function addExternalRoot(packagePath) {
    let resolvedPath;

    try {
      resolvedPath = fs.realpathSync(packagePath);
    } catch {
      return;
    }

    if (!resolvedPath.startsWith(`${workspaceRoot}${path.sep}`)) {
      packageRoots.add(resolvedPath);
    }

    let currentPath = resolvedPath;

    while (true) {
      if (path.basename(currentPath) === ".pnpm") {
        nodeModulesRoots.add(path.dirname(currentPath));
        return;
      }

      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) {
        return;
      }

      currentPath = parentPath;
    }
  }

  for (const entry of fs.readdirSync(nodeModulesDir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    if (entry.isDirectory() && entry.name.startsWith("@")) {
      const scopeDir = path.join(nodeModulesDir, entry.name);

      for (const scopedEntry of fs.readdirSync(scopeDir, { withFileTypes: true })) {
        addExternalRoot(path.join(scopeDir, scopedEntry.name));
      }

      continue;
    }

    addExternalRoot(path.join(nodeModulesDir, entry.name));
  }

  return {
    nodeModulesRoots: [...nodeModulesRoots],
    packageRoots: [...packageRoots]
  };
}

const projectDependencyTargets = collectExternalDependencyTargets(path.join(projectRoot, "node_modules"));
const workspaceDependencyTargets = collectExternalDependencyTargets(path.join(workspaceRoot, "node_modules"));
const externalNodeModulesRoots = [
  ...projectDependencyTargets.nodeModulesRoots,
  ...workspaceDependencyTargets.nodeModulesRoots
];
const externalPackageRoots = [
  ...projectDependencyTargets.packageRoots,
  ...workspaceDependencyTargets.packageRoots
];
const config = getDefaultConfig(projectRoot);
const watchFolders = new Set([workspaceRoot, ...externalNodeModulesRoots, ...externalPackageRoots]);
const nodeModulesPaths = new Set([
  path.join(projectRoot, "node_modules"),
  path.join(workspaceRoot, "node_modules"),
  ...externalNodeModulesRoots
]);

config.watchFolders = [...watchFolders];
config.resolver.nodeModulesPaths = [...nodeModulesPaths];
config.resolver.unstable_enableSymlinks = true;

module.exports = withNativeWind(config, { input: "./global.css" });

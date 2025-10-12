#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const preloadSrc = path.join(projectRoot, 'src', 'main', 'preload.js');
const preloadDest = path.join(distDir, 'preload.js');
const pngSrc = path.join(projectRoot, 'png');
const pngDest = path.join(distDir, 'png');

async function copyFile(source, destination) {
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  await fs.promises.copyFile(source, destination);
}

async function copyDirectory(source, destination) {
  const entries = await fs.promises.readdir(source, { withFileTypes: true });
  await fs.promises.mkdir(destination, { recursive: true });

  for (const entry of entries) {
    const srcPath = path.join(source, entry.name);
    const destPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      const resolved = await fs.promises.realpath(srcPath);
      await copyFile(resolved, destPath);
    } else if (entry.isFile()) {
      await copyFile(srcPath, destPath);
    }
  }
}

async function main(mode = 'all') {
  if (mode === 'preload' || mode === 'all') {
    if (!fs.existsSync(preloadSrc)) {
      throw new Error(`Missing preload source at ${preloadSrc}`);
    }
    await copyFile(preloadSrc, preloadDest);
  }

  if (mode === 'assets' || mode === 'all') {
    if (!fs.existsSync(pngSrc)) {
      throw new Error(`Missing png directory at ${pngSrc}`);
    }
    await copyDirectory(pngSrc, pngDest);
  }
}

main(process.argv[2] ?? 'all')
  .then(() => {
    console.log('Assets copied successfully.');
  })
  .catch((error) => {
    console.error('Asset copy failed:', error.message);
    process.exit(1);
  });

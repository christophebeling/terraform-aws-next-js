/**
 * Builds the fixtures with terraform-next-build
 */

const { readdir, stat } = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

const pathToFixtures = path.join(__dirname, 'fixtures');

// Get subdirs from a given path
const getDirs = async (_path) => {
  let dirs = [];
  for (const file of await readdir(_path)) {
    if ((await stat(path.join(_path, file))).isDirectory()) {
      dirs = [...dirs, file];
    }
  }
  return dirs;
};

async function buildFixtures() {
  const fixtures = (await getDirs(pathToFixtures)).map((_path) =>
    path.resolve(pathToFixtures, _path)
  );

  function build(buildPath) {
    const command = 'yarnpkg';
    const args = ['tf-next', 'build'];

    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: buildPath,
        // stdio: 'ignore',
        stdio: 'inherit',
      });

      child.on('close', (code) => {
        if (code !== 0) {
          reject({
            command: `${command} ${args.join(' ')}`,
          });
          return;
        }
        resolve();
      });
    });
  }

  // Build all fixtures sequentially
  for (const fixture of fixtures) {
    console.log(`Building fixture "${fixture}"`);
    await build(fixture);
  }
}

buildFixtures();

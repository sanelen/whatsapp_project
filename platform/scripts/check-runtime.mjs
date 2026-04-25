const requiredNodeMajor = 22;
const requiredNpmMajor = 10;

const nodeMajor = Number(process.versions.node.split('.')[0]);
const npmVersion = process.env.npm_config_user_agent?.match(/npm\/([0-9.]+)/)?.[1];
const npmMajor = npmVersion ? Number(npmVersion.split('.')[0]) : null;

if (nodeMajor !== requiredNodeMajor) {
  console.error(
    [
      `Unsupported Node.js version: ${process.versions.node}.`,
      `This project is pinned to Node ${requiredNodeMajor}.x to avoid latest-runtime drift.`,
      'Use: brew link --overwrite --force node@22',
    ].join('\n')
  );
  process.exit(1);
}

if (npmMajor !== null && npmMajor !== requiredNpmMajor) {
  console.error(
    [
      `Unsupported npm version: ${npmVersion}.`,
      `This project is pinned to npm ${requiredNpmMajor}.x with Node ${requiredNodeMajor}.x.`,
      'Use the npm bundled with Homebrew node@22.',
    ].join('\n')
  );
  process.exit(1);
}

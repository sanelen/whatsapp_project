const requiredNodeMajor = 22;
const requiredNpmMajor = 10;

const nodeMajor = Number(process.versions.node.split('.')[0]);
const npmVersion = process.env.npm_config_user_agent?.match(/npm\/([0-9.]+)/)?.[1];
const npmMajor = npmVersion ? Number(npmVersion.split('.')[0]) : null;

if (nodeMajor < requiredNodeMajor) {
  console.error(
    [
      `Unsupported Node.js version: ${process.versions.node}.`,
      `This project requires Node ${requiredNodeMajor}.x or higher.`,
      'Use: brew install node@22 or higher',
    ].join('\n')
  );
  process.exit(1);
}

if (npmMajor !== null && npmMajor < requiredNpmMajor) {
  console.error(
    [
      `Unsupported npm version: ${npmVersion}.`,
      `This project requires npm ${requiredNpmMajor}.x or higher.`,
      'Use: npm install -g npm@latest',
    ].join('\n')
  );
  process.exit(1);
}

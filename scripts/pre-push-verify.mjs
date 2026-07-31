import { spawnSync } from 'node:child_process';

function quoteWindowsArg(arg) {
  if (!arg.length) {
    return '""';
  }

  if (!/[\s"]/u.test(arg)) {
    return arg;
  }

  return `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`;
}

function resolveCommand(command, args) {
  if (process.platform !== 'win32') {
    return { command, args };
  }

  return {
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', [command, ...args].map(quoteWindowsArg).join(' ')],
  };
}

function run(command, args) {
  const resolved = resolveCommand(command, args);
  const result = spawnSync(resolved.command, resolved.args, {
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      HUSKY: '0',
    },
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// Проверяем в чистом чекауте, а не в текущем рабочем дереве: незакоммиченные
// файлы и уже установленные зависимости легко скрывают то, что упадёт в CI.
console.log('[pre-push] Running CI in a clean checkout...');
run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'ci:clean']);

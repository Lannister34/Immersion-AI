import { RoleGateError } from './role-gate-error.mjs';

export function parseRoleGateArguments(argv) {
  let update = false;
  for (const argument of argv) {
    if (argument !== '--update-baseline') {
      throw new RoleGateError(`unknown argument ${argument}; the only option is --update-baseline`);
    }
    update = true;
  }
  return { update };
}

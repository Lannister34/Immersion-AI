export function parseUpdateBaselineArguments(argv, GateError) {
  let update = false;
  for (const argument of argv) {
    if (argument !== '--update-baseline') {
      throw new GateError(`unknown argument ${argument}; the only option is --update-baseline`);
    }
    update = true;
  }
  return { update };
}

const VALUE = String.raw`[^\s"'\x60;&|()^,\]}]*`;
const HOST_OPTION = new RegExp(
  String.raw`(?<![\w-])--host(?![\w.-])(?:=["'\x60]?(${VALUE})|[\s"'\x60,]*(${VALUE}))`,
  'gi',
);
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function boundHost([, joined, separate]) {
  if (joined !== undefined) return joined;
  return separate.startsWith('-') ? '' : separate;
}

export const nonLoopbackHostBind = {
  name: 'non-loopback-host-bind',
  explanation:
    'A launcher binds a server to this computer only. A bare --host, which Vite reads as every interface, ' +
    'and a --host other than 127.0.0.1, localhost or ::1 let other machines on the network reach the dev ' +
    'server and the API it proxies. Leave the host to the config the server reads, or pass --host 127.0.0.1.',
  find(line) {
    const offsets = [];
    for (const match of line.matchAll(HOST_OPTION)) {
      if (!LOOPBACK_HOSTS.has(boundHost(match).toLowerCase())) offsets.push(match.index);
    }
    return offsets;
  },
};

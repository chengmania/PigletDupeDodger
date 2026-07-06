import { $ } from 'bun';
import { cp, mkdir, writeFile } from 'node:fs/promises';

const TARGETS = [
  { bunTarget: 'bun-windows-x64', suffix: 'win.exe' },
  { bunTarget: 'bun-darwin-arm64', suffix: 'mac-arm' },
  { bunTarget: 'bun-darwin-x64', suffix: 'mac-intel' },
  { bunTarget: 'bun-linux-x64', suffix: 'linux' },
] as const;

const START_HERE = `PigletDupeDodger -- quick start
================================

1. Copy this folder onto the computer that will run the host at your Field
   Day site (a laptop, desktop, or something like a Raspberry Pi -- needs no
   internet connection, just a shared WiFi network with the operator
   stations).
2. Run the binary for that computer's OS:
     Windows -> PigletDupeDodger-win.exe (double-click)
     Mac (Apple Silicon) -> PigletDupeDodger-mac-arm
     Mac (Intel) -> PigletDupeDodger-mac-intel
     Linux -> PigletDupeDodger-linux
   (On Mac/Linux you may need to run "chmod +x <file>" once first, and
   launch it from a terminal: ./PigletDupeDodger-mac-arm)
3. The terminal window will print a QR code and a list of URLs, e.g.
   http://192.168.1.42:8073 -- note the one on your local WiFi network.
4. On every operator's laptop/tablet/phone, connect to the same WiFi network
   as the host, then open that URL in a browser (or scan the QR code).
   No install needed on any client.
5. Before the event: one person should visit <that URL>/captain (typed into
   the address bar -- it's not linked from any operator screen) to set up
   the Captain's Station login, club config, and bonus checklist. First
   visit shows a one-time recovery code -- write it down somewhere safe,
   it's the only way back in if the Captain password is forgotten.
6. All QSOs are saved as they're logged into the fdlog-data/ folder next to
   the binary. Don't delete that folder during the event -- it's your only
   copy until you export at the end (Captain's Station has the exports and
   the full journal backup download).

73, and may your dupes always be dodged!
`;

async function main() {
  console.log('Building client bundle...');
  await $`bun build ./src/client/main.ts --outfile public/app.js --minify`;

  await mkdir('dist', { recursive: true });

  for (const t of TARGETS) {
    const outfile = `dist/PigletDupeDodger-${t.suffix}`;
    console.log(`Compiling ${outfile} (${t.bunTarget})...`);
    await $`bun build --compile --target=${t.bunTarget} ./src/server/index.ts --outfile ${outfile}`;
  }

  const bundleDir = 'dist/bundle';
  await mkdir(`${bundleDir}/fdlog-data`, { recursive: true });
  for (const t of TARGETS) {
    await cp(`dist/PigletDupeDodger-${t.suffix}`, `${bundleDir}/PigletDupeDodger-${t.suffix}`);
  }
  await writeFile(`${bundleDir}/START-HERE.txt`, START_HERE);
  await writeFile(`${bundleDir}/fdlog-data/.gitkeep`, '');

  try {
    await $`cd dist && zip -r bundle.zip bundle`.quiet();
    console.log('Created dist/bundle.zip');
  } catch {
    console.log('("zip" command not found -- dist/bundle/ left as a plain folder)');
  }

  console.log('\nDone. See dist/bundle/');
}

main();

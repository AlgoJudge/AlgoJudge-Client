import { fileURLToPath, URL } from 'node:url';

import { defineConfig, loadEnv } from 'vite';
import plugin from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import child_process from 'child_process';

function getHttpsOption(env) {
    if (!env.VITE_DOTNET_CERT || env.VITE_DOTNET_CERT == 'false') {
        return undefined;
    }

    const baseFolder =
        process.env.APPDATA !== undefined && process.env.APPDATA !== ''
            ? `${process.env.APPDATA}/ASP.NET/https`
            : `${process.env.HOME}/.aspnet/https`;

    const certificateArg = process.argv.map(arg => arg.match(/--name=(?<value>.+)/i)).filter(Boolean)[0];
    const certificateName = certificateArg ? certificateArg.groups.value : "algojudge-client";

    if (!certificateName) {
        console.error('Invalid certificate name. Run this script in the context of an npm/yarn script or pass --name=<<app>> explicitly.')
        process.exit(-1);
    }

    const certFilePath = path.join(baseFolder, `${certificateName}.pem`);
    const keyFilePath = path.join(baseFolder, `${certificateName}.key`);

    if (!fs.existsSync(certFilePath) || !fs.existsSync(keyFilePath)) {
        if (0 !== child_process.spawnSync('dotnet', [
            'dev-certs',
            'https',
            '--export-path',
            certFilePath,
            '--format',
            'Pem',
            '--no-password',
        ], { stdio: 'inherit', }).status) {
            throw new Error("Could not create certificate.");
        }
    }

    return {
        key: fs.readFileSync(keyFilePath),
        cert: fs.readFileSync(certFilePath),
    }
}

// https://vitejs.dev/config/
export default defineConfig(({mode}) => {
    const env = {...process.env, ...loadEnv(mode, process.cwd())};
    return {
        base: '/',
        plugins: [plugin()],
        resolve: {
            alias: {
                '@': fileURLToPath(new URL('./src', import.meta.url)),
                '@tabler/icons-react': '@tabler/icons-react/dist/esm/icons/index.mjs',
            }
        },
        server: {
            port: 5173,
            https: getHttpsOption(env)
        }
    }
})

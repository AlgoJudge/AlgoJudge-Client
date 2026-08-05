// Checks the dependency lists that `npm run lint` cannot see.
//
// `useApiEffect` passes its dependency list straight through to `useEffect`, so
// the rule gives up at the wrapper and every one of its call sites goes
// unchecked — which is where a stale closure would actually live. This runs the
// same rule with the wrapper declared as an effect hook.
//
// It is not part of the gate, because that costs one false positive per call
// site: the rule insists an effect callback be synchronous, and ours is async by
// design. That one message is filtered out here; everything else is reported.
import { ESLint } from "eslint";
import base from "../eslint.config.mjs";

const ASYNC_CALLBACK = /^Effect callbacks are synchronous/;

const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
        ...base,
        {
            files: ["**/*.{ts,tsx}"],
            rules: {
                "react-hooks/exhaustive-deps": ["warn", { additionalHooks: "(useApiEffect)" }],
            },
        },
    ],
});

const results = await eslint.lintFiles(["src"]);

let found = 0;
for (const result of results) {
    const messages = result.messages.filter(m => !ASYNC_CALLBACK.test(m.message));
    if (messages.length === 0) continue;
    console.log(result.filePath.replace(process.cwd() + "\\", "").replace(process.cwd() + "/", ""));
    for (const message of messages) {
        console.log(`  ${message.line}:${message.column}  ${message.message.split("\n")[0]}`);
        found++;
    }
}

console.log(found === 0
    ? "no dependency findings"
    : `${found} findings — each one is a judgement call, not a failure`);

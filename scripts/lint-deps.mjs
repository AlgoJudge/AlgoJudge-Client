// Checks the dependency lists that `npm run lint` cannot see.
//
// `useApiEffect` passes its dependency list straight through to `useEffect`, so
// the rule gives up at the wrapper and every one of its call sites goes
// unchecked — which is where a stale closure would actually live, and the list
// each screen declares is the whole point of the helper. This runs the same rule
// with the wrapper declared as an effect hook.
//
// `eslint .` cannot do this itself: with the wrapper declared, it also insists
// that an effect callback be synchronous, and every one of ours is async by
// design. That single message is filtered out here. Anything else fails.
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

if (found > 0) process.exitCode = 1;
console.log(found === 0
    ? "dependency check passed"
    : `\nFAILED: ${found} dependency ${found === 1 ? "problem" : "problems"}`);

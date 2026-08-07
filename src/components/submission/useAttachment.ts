import { useEffect, useState } from "react";
import { SubmissionFile } from "../../api/ParticipantApi";
import { useApi } from "../../provider/apiContext";

/**
 * The text of one named attachment, fetched by id.
 *
 * A submission's files are stored files like any other, so they are read with
 * `fileApi.getText` rather than through an endpoint of their own — there used to
 * be `getSubmissionFile(activityId, submissionId, name)` on both APIs, which was
 * a second way to fetch a file the store already served.
 *
 * **An absent name is not an error.** The Server sends only what the reader may
 * see, so a missing `log` means either that nothing was logged or that this
 * activity keeps logs to its managers — and the screen has no business telling
 * those apart.
 */
export const useAttachment = (files: SubmissionFile[] | undefined, name: string) => {
    const api = useApi();
    const [text, setText] = useState<string | undefined>(undefined);
    const [loading, setLoading] = useState(false);

    const file = files?.find(candidate => candidate.name === name);
    const fileId = file?.fileId;

    useEffect(() => {
        if (!fileId) {
            setText(undefined);
            return;
        }
        const controller = new AbortController();
        setLoading(true);
        api.fileApi.getText(fileId, controller.signal)
            .then(setText)
            .catch(() => {
                // A file that will not load is one the screen draws without.
                if (!controller.signal.aborted) setText(undefined);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [api, fileId]);

    return { file, text, loading };
};

/**
 * The same, parsed as the JSON document a result renderer reads.
 *
 * Unparseable is the same as absent: the renderers already draw that case, and a
 * half-read document is worse than none.
 */
export const useResultDocument = (files: SubmissionFile[] | undefined, name: string) => {
    const { file, text, loading } = useAttachment(files, name);
    let document: unknown = undefined;
    if (text !== undefined) {
        try {
            document = JSON.parse(text);
        } catch {
            document = undefined;
        }
    }
    return { file, document, loading };
};

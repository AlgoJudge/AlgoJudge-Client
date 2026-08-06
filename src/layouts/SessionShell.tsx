import { Center, Loader } from "@mantine/core";
import { useAuth } from "../provider/authContext";
import Layout from "../Layout";
import AppLayout from "./app/AppLayout";

/**
 * The shell for a page that is public but also has a signed-in reading.
 *
 * The front page and the instance's documents are open to anybody — somebody has
 * to be able to read the privacy policy before deciding whether to have an
 * account — but a signed-in reader opening one of them used to lose the whole
 * application around it: the navigation, the mark and the activity clock were
 * replaced by the visitor's header, and came back on the next click. The page is
 * the same page; only the shell around it follows the session.
 *
 * The login and registration screens deliberately do not use this: an
 * application shell around a form for somebody who has no session yet would
 * offer navigation to nowhere.
 */
export default function SessionShell() {
    const { status } = useAuth();
    // Waited out rather than guessed. Rendering the public shell while the
    // session is still being asked for, then swapping it a frame later, flashes
    // the entire page on every single load — worse than the inconsistency this
    // exists to remove.
    if (status === "loading") {
        return <Center my="xl"><Loader size="xl" /></Center>;
    }
    return status === "authenticated" ? <AppLayout /> : <Layout />;
}

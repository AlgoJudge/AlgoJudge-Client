import { Center, Loader } from "@mantine/core";
import { useLaunch } from "../provider/launchContext";
import AppLayout from "./app/AppLayout";
import EmbeddedLayout from "./lti/EmbeddedLayout";

/**
 * Which shell the application wears.
 *
 * <b>Decided by how the session was established, and by nothing in the
 * address</b> — which is the whole of §5.2's rule. A tab that exchanged a launch
 * ticket the platform framed gets the confined interface; every other tab,
 * including a second one somebody opened themselves, gets the full application.
 *
 * The same shape as `SessionShell`, and for the same reason: the page below is
 * the same page, and only the chrome around it follows the circumstances.
 */
export default function LaunchShell() {
    const { status, launch } = useLaunch();

    // Waited out rather than guessed. Drawing the full shell and swapping it a
    // frame later flashes the entire interface on every launch — worse than the
    // wait, and inside a small frame it looks like a fault.
    if (status === "loading") {
        return <Center my="xl"><Loader size="xl" /></Center>;
    }

    return launch?.embedded ? <EmbeddedLayout /> : <AppLayout />;
}

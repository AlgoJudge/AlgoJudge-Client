import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { CodeHighlightAdapterProvider } from '@mantine/code-highlight';
import { shikiAdapter } from './components/codehighlight/shikiAdapter';
import './App.css';

import { MantineProvider } from '@mantine/core';
import { theme } from './theme';
import { Notifications } from '@mantine/notifications';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { lazy, ReactNode } from 'react';
import Layout from './Layout';
import HomePage from './pages/home/HomePage';
import LoginPage from './pages/login/LoginPage';

import RegisterPage from './pages/register/RegisterPage';
import SessionShell from './layouts/SessionShell';
import LaunchShell from './layouts/LaunchShell';
import LaunchedPage from './pages/lti/LaunchedPage';
import LaunchRefusedPage from './pages/lti/LaunchRefusedPage';
import LaunchSignInPage from './pages/lti/LaunchSignInPage';
import LaunchConflictPage from './pages/lti/LaunchConflictPage';
import ChoosePage from './pages/lti/ChoosePage';
import { LaunchProvider } from './provider/LaunchProvider';
import ActivitiesPage from './pages/activities/ActivitiesPage';
import ActivityPage from './pages/activities/activity_id/ActivityPage';
import ProblemsPage from './pages/activities/activity_id/problems/ProblemsPage';
import SubmitPage from './pages/activities/activity_id/submit/SubmitPage';
import SubmissionsPage from './pages/activities/activity_id/submissions/SubmissionsPage';
import RankingPage from './pages/activities/activity_id/ranking/RankingPage';
import QuestionsPage from './pages/activities/activity_id/questions/QuestionsPage';
import RulesPage from './pages/activities/activity_id/rules/RulesPage';
import ProblemPage from './pages/activities/activity_id/problems/problem_id/ProblemPage';
import SubmissionPage from './pages/activities/activity_id/submissions/submission_id/SubmissionPage';
import CodePage from './pages/activities/activity_id/submissions/submission_id/code/CodePage';

import { ApiProvider } from './provider/ApiProvider';
import { AuthProvider } from './provider/AuthProvider';
import { MaintenanceProvider } from './provider/MaintenanceProvider';
import { EventsProvider } from './provider/EventsProvider';
import { InstanceProvider } from './provider/InstanceProvider';
import { PermissionsProvider } from './provider/PermissionsProvider';
import RequireSession from './routers/Authentication';
import RequirePermission from './routers/RequirePermission';
import { areaFor, MANAGER_PERMISSIONS } from './pages/manager/managerAreas';
const AccountPage = lazy(() => import('./pages/account/AccountPage'));
const LegalPage = lazy(() => import('./pages/legal/LegalPage'));

// The manager panel is a different application wearing the same shell, and a
// participant never opens it. Split out so they do not download it.
const ManagerPage = lazy(() => import('./pages/manager/ManagerPage'));
const UsersPage = lazy(() => import('./pages/manager/users/UsersPage'));
const RunnersPage = lazy(() => import('./pages/manager/runners/RunnersPage'));
const ManagerActivitiesPage = lazy(() => import('./pages/manager/activities/ManagerActivitiesPage'));
const ManagerActivityPage = lazy(() => import('./pages/manager/activities/activity_id/ManagerActivityPage'));
const PermissionTemplatesPage = lazy(() => import('./pages/manager/permission_templates/PermissionTemplatesPage'));
const GrantsPage = lazy(() => import('./pages/manager/grants/GrantsPage'));
const ManagerProblemsPage = lazy(() => import('./pages/manager/problems/ManagerProblemsPage'));
const ManagerProblemPage = lazy(() => import('./pages/manager/problems/problem_id/ManagerProblemPage'));
const ManagerSubmissionsPage = lazy(() => import('./pages/manager/submissions/ManagerSubmissionsPage'));
const ManagerSubmissionPage = lazy(() => import('./pages/manager/submissions/submission_id/ManagerSubmissionPage'));
const ManagerQuestionsPage = lazy(() => import('./pages/manager/questions/ManagerQuestionsPage'));
const ManagerInstancePage = lazy(() => import('./pages/manager/instance/ManagerInstancePage'));
const ManagerExternalContentPage = lazy(() => import('./pages/manager/external/ManagerExternalContentPage'));
const ProvidersPage = lazy(() => import('./pages/manager/providers/ProvidersPage'));
const LtiPlatformsPage = lazy(() => import('./pages/manager/lti/LtiPlatformsPage'));

function App() {

    /**
     * A manager route, with what the panel's own table says it needs.
     *
     * Read from that table rather than repeated here, so a screen cannot end up
     * listed in the menu under one permission and guarded by another.
     */
    const managerRoute = (path: string, element: ReactNode) => ({
        path,
        element: (
            <RequirePermission permissions={areaFor(path)?.permissions ?? MANAGER_PERMISSIONS}>
                {element}
            </RequirePermission>
        ),
    });

    const router = createBrowserRouter([
        // Every shell below is a layout route without a path of its own. Given
        // one, a shell whose children do not match still matches the address by
        // itself, and then draws its chrome around an empty page — which is what
        // `/` did the moment a second shell was added beside the first.
        {
            // Where a launch lands, and the three ways one can end badly.
            //
            // **No shell at all.** These are drawn inside a course page, where
            // Moodle already provides the header, the footer and the legal
            // links; §5.2 asks for that chrome to be removed rather than
            // doubled. They also have to render for somebody with no session,
            // because "the session did not survive the frame" is exactly what
            // one of them exists to say.
            children: [
                {
                    path: "/lti/launched",
                    element: <LaunchedPage />
                },
                {
                    path: "/lti/failed",
                    element: <LaunchRefusedPage />
                },
                {
                    path: "/lti/sign-in",
                    element: <LaunchSignInPage />
                },
                {
                    path: "/lti/conflict",
                    element: <LaunchConflictPage />
                },
                {
                    // Where a deep linking request lands. Inside the launch
                    // shell, because it happens in the platform's frame like
                    // every other launch — and because the person here has a
                    // session this tool made, not one they signed into.
                    path: "/lti/choose",
                    element: <ChoosePage />
                },
            ]
        },
        {
            // The visitor's shell, and only the visitor's: an application shell
            // around a sign-in form would offer navigation to nowhere.
            element: <Layout />,
            children: [
                {
                    path: "/login",
                    element: <LoginPage />
                },
                {
                    path: "/register",
                    element: <RegisterPage />
                },
            ]
        },
        {
            // Public, but with a signed-in reading of the same page. The front
            // page already shows the operator's other document to somebody
            // signed in, and the legal documents must stay open to everybody —
            // somebody has to be able to read the privacy policy before deciding
            // whether to have an account at all. The shell follows the session
            // so that reading one does not take the application away.
            element: <SessionShell />,
            children: [
                {
                    path: "/",
                    element: <HomePage />
                },
                {
                    path: "/terms",
                    element: <LegalPage />
                },
                {
                    path: "/privacy",
                    element: <LegalPage />
                },
                {
                    path: "/cookies",
                    element: <LegalPage />
                },
                {
                    path: "/accessibility",
                    element: <LegalPage />
                },
            ]
        },
        {
            // One guard for the whole application shell: every participant and
            // manager screen is a child of it, so there is no route that can be
            // added later and forgotten here.
            // **The shell follows the launch, not the address.** `LaunchShell`
            // draws the confined interface for a tab that arrived through a
            // framed launch and the full application for every other one; §5.2
            // will not have the mode entered because a URL said so.
            element: <RequireSession><LaunchShell /></RequireSession>,
            children: [
                {
                    path: "/account",
                    element: <AccountPage />
                },
                {
                    path: "/activities",
                    element: <ActivitiesPage />
                },
                {
                    // The activity's own page: what its organiser wrote, or the
                    // form to enrol for somebody who is not in it yet. Exact, so
                    // it does not swallow the screens below it.
                    path: "/activities/:activityId",
                    element: <ActivityPage />
                },
                {
                    path: "/activities/:activityId/problems",
                    element: <ProblemsPage />
                },
                {
                    path: "/activities/:activityId/submit/:problemId?",
                    element: <SubmitPage />
                },
                {
                    path: "/activities/:activityId/submissions",
                    element: <SubmissionsPage />
                },
                {
                    path: "/activities/:activityId/ranking",
                    element: <RankingPage />
                },
                {
                    path: "/activities/:activityId/questions",
                    element: <QuestionsPage />
                },
                {
                    path: "/activities/:activityId/rules",
                    element: <RulesPage />
                },
                {
                    path: "/activities/:activityId/problems/:problemId",
                    element: <ProblemPage />
                },
                {
                    path: "/activities/:activityId/submissions/:submissionId",
                    element: <SubmissionPage />
                },
                {
                    path: "/activities/:activityId/submissions/:submissionId/code",
                    element: <CodePage />
                },
                managerRoute("/manager", <ManagerPage />),
                managerRoute("/manager/activities", <ManagerActivitiesPage />),
                managerRoute("/manager/activities/:activityId", <ManagerActivityPage />),
                managerRoute("/manager/users", <UsersPage />),
                managerRoute("/manager/problems", <ManagerProblemsPage />),
                managerRoute("/manager/problems/:problemId", <ManagerProblemPage />),
                managerRoute("/manager/submissions", <ManagerSubmissionsPage />),
                managerRoute("/manager/submissions/:submissionId", <ManagerSubmissionPage />),
                managerRoute("/manager/questions", <ManagerQuestionsPage />),
                managerRoute("/manager/grants", <GrantsPage />),
                managerRoute("/manager/permission-templates", <PermissionTemplatesPage />),
                managerRoute("/manager/runners", <RunnersPage />),
                managerRoute("/manager/instance", <ManagerInstancePage />),
                managerRoute("/manager/external-content", <ManagerExternalContentPage />),
                managerRoute("/manager/oidc", <ProvidersPage />),
                managerRoute("/manager/lti", <LtiPlatformsPage />)
            ]
        }
    ], { basename: import.meta.env.BASE_URL });

    return (
            <MantineProvider theme={theme}>
                <CodeHighlightAdapterProvider adapter={shikiAdapter}>
                <ApiProvider>
                    {/* Above the session, because an outage breaks the login
                        screen too: a Server that cannot answer `/account`
                        cannot answer `/identity/login` either. While it is
                        away this replaces everything below, which is also
                        what makes coming back refetch — the screens mount
                        fresh rather than showing what was true before. */}
                    <MaintenanceProvider>
                    {/* Above the router, so the application shell sees the same
                        session as the public one. Permissions sit inside the
                        session, because they are a property of it. */}
                    <AuthProvider>
                        <InstanceProvider>
                            <PermissionsProvider>
                                {/* Inside the session, because the socket is
                                    authenticated by it and lives exactly as
                                    long. */}
                                <EventsProvider>
                                    {/* Bottom **left**: the right-hand corner
                                        is the submissions panel's, and the
                                        right-hand edge above it is the
                                        navigation a notification was landing
                                        on. */}
                                    <Notifications position="bottom-left" />
                                    {/* Inside the session, because the ticket is
                                        claimed as the person the launch resolved
                                        to — and above the router, because the
                                        shell a route draws depends on whether
                                        this tab is inside a launch. */}
                                    <LaunchProvider>
                                        <RouterProvider router={router} />
                                    </LaunchProvider>
                                </EventsProvider>
                            </PermissionsProvider>
                        </InstanceProvider>
                    </AuthProvider>
                    </MaintenanceProvider>
                </ApiProvider>
                </CodeHighlightAdapterProvider>
            </MantineProvider>
    );
}

export default App;